package connections

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

type fakeVault struct {
	key string
	err error
}

func (f fakeVault) RevealFor(context.Context, string, string, string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	return f.key, nil
}

func sign(alg, key string, body []byte) string {
	var m = hmac.New(sha256.New, []byte(key))
	if alg == "hmac-sha512" {
		m = hmac.New(sha512.New, []byte(key))
	}
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

func recv(v Revealer) *Receiver {
	return &Receiver{log: slog.New(slog.NewTextHandler(io.Discard, nil)), vault: v}
}

func req(header, value string) *http.Request {
	r, _ := http.NewRequest(http.MethodPost, "/", nil)
	if header != "" {
		r.Header.Set(header, value)
	}
	return r
}

// The endpoint is public and unauthenticated — the path token is the credential
// and the HMAC is the authentication. Everything here is the second half.
func TestVerify(t *testing.T) {
	body := []byte(`{"deploy":"failed"}`)
	const key = "s3cret-signing-key"
	src := &source{
		Slug: "deploys", SigningSecretRef: "hook-key",
		SignatureHeader: "X-Builder-Signature", SignatureAlgo: "hmac-sha256",
	}

	t.Run("a correct signature passes", func(t *testing.T) {
		err := recv(fakeVault{key: key}).verify(context.Background(), src,
			req("X-Builder-Signature", sign("hmac-sha256", key, body)), body)
		if err != nil {
			t.Fatal(err)
		}
	})

	// GitHub and others send "sha256=<hex>". Tolerating the prefix is the
	// difference between working with the ecosystem and requiring every sender
	// to be special-cased.
	t.Run("a sha256= prefix is tolerated", func(t *testing.T) {
		err := recv(fakeVault{key: key}).verify(context.Background(), src,
			req("X-Builder-Signature", "sha256="+sign("hmac-sha256", key, body)), body)
		if err != nil {
			t.Fatal(err)
		}
	})

	t.Run("uppercase hex passes", func(t *testing.T) {
		err := recv(fakeVault{key: key}).verify(context.Background(), src,
			req("X-Builder-Signature", strings.ToUpper(sign("hmac-sha256", key, body))), body)
		if err != nil {
			t.Fatal(err)
		}
	})

	t.Run("sha512 when the source asks for it", func(t *testing.T) {
		s512 := *src
		s512.SignatureAlgo = "hmac-sha512"
		err := recv(fakeVault{key: key}).verify(context.Background(), &s512,
			req("X-Builder-Signature", sign("hmac-sha512", key, body)), body)
		if err != nil {
			t.Fatal(err)
		}
	})

	for _, tc := range []struct {
		name, header, value, wantErr string
		vault                        Revealer
		body                         []byte
	}{
		{name: "no signature header", header: "", wantErr: "missing", vault: fakeVault{key: key}, body: body},
		{name: "wrong signature", header: "X-Builder-Signature", value: sign("hmac-sha256", "wrong-key", body),
			wantErr: "mismatch", vault: fakeVault{key: key}, body: body},
		// The signature covers the body. A tampered body with a signature that
		// was valid for the original must fail — that is the entire point.
		{name: "tampered body", header: "X-Builder-Signature", value: sign("hmac-sha256", key, body),
			wantErr: "mismatch", vault: fakeVault{key: key}, body: []byte(`{"deploy":"succeeded"}`)},
		{name: "garbage signature", header: "X-Builder-Signature", value: "not-a-signature",
			wantErr: "mismatch", vault: fakeVault{key: key}, body: body},
		// This is the SF-001 path: the vault cannot grant a webhook source its
		// key, so every delivery is refused. Refusing an unverifiable delivery
		// is correct; the bug is that the grant cannot be created.
		{name: "vault refuses the key", header: "X-Builder-Signature", value: sign("hmac-sha256", key, body),
			wantErr: "cannot read signing secret", vault: fakeVault{err: errors.New("may not reveal")}, body: body},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := recv(tc.vault).verify(context.Background(), src, req(tc.header, tc.value), tc.body)
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("got %v, want an error containing %q", err, tc.wantErr)
			}
		})
	}
}

// The schema's CHECK already forbids an enabled source with an empty signing
// ref. This is the belt to that braces: "cannot normally happen" is not
// "cannot", and the failure mode is an open pipe into project memory.
func TestVerifyRefusesAnUnsignedSource(t *testing.T) {
	err := recv(fakeVault{key: "k"}).verify(context.Background(),
		&source{Slug: "x", SignatureHeader: "X-Sig"}, req("X-Sig", "abc"), []byte("{}"))
	if err == nil || !strings.Contains(err.Error(), "no signing secret") {
		t.Fatalf("got %v", err)
	}
}
