package brain

import (
	"context"
	"hash/fnv"
	"math"
	"strings"
)

// HashEmbedder is a deterministic local embedder: hashed bag-of-words projected
// into Dim and L2-normalized.
//
// It is NOT a semantic model — it captures lexical overlap, not meaning. It
// exists so the brain works out of the box with no API key and no network, and
// so the hybrid recall path is exercised from day one. A real project swaps in
// a proper embedder through the same interface; the store never knows.
//
// L2-normalized because pgvector's cosine operator assumes it, and unnormalized
// vectors make distance depend on document length rather than content.
type HashEmbedder struct{}

func (HashEmbedder) Name() string    { return "hash-bow" }
func (HashEmbedder) Dimensions() int { return Dim }

func (h HashEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, 0, len(texts))
	for _, t := range texts {
		v := make([]float32, Dim)
		for _, tok := range tokenize(t) {
			f := fnv.New32a()
			_, _ = f.Write([]byte(tok))
			s := f.Sum32()
			// Two buckets per token with opposing signs: halves the collision
			// rate versus a single bucket, at no real cost.
			v[s%Dim] += 1
			v[(s/Dim)%Dim] -= 0.5
		}
		var norm float64
		for _, f := range v {
			norm += float64(f) * float64(f)
		}
		if norm > 0 {
			n := float32(1 / math.Sqrt(norm))
			for i := range v {
				v[i] *= n
			}
		}
		out = append(out, v)
	}
	return out, nil
}

func tokenize(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r >= 0x0600 && r <= 0x06FF)
	})
}
