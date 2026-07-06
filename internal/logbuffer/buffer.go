package logbuffer

import (
	"sync"
	"time"
)

type Entry struct {
	Time    time.Time
	Level   string
	Message string
	Line    string
}

type Buffer struct {
	mu      sync.RWMutex
	entries []Entry
	size    int
	pos     int
	full    bool

	subs   map[int]chan Entry
	nextID int
}

func New(size int) *Buffer {
	if size <= 0 {
		size = 1000
	}
	return &Buffer{
		entries: make([]Entry, size),
		size:    size,
		subs:    make(map[int]chan Entry),
	}
}

func (b *Buffer) Write(e Entry) {
	b.mu.Lock()
	b.entries[b.pos] = e
	b.pos = (b.pos + 1) % b.size
	if b.pos == 0 {
		b.full = true
	}
	subs := make(map[int]chan Entry, len(b.subs))
	for id, ch := range b.subs {
		subs[id] = ch
	}
	b.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- e:
		default:
		}
	}
}

func (b *Buffer) Snapshot(n int) []Entry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	total := b.pos
	if b.full {
		total = b.size
	}
	if n <= 0 || n > total {
		n = total
	}

	result := make([]Entry, n)
	if b.full {
		start := (b.pos - n + b.size) % b.size
		for i := range n {
			result[i] = b.entries[(start+i)%b.size]
		}
	} else {
		start := b.pos - n
		copy(result, b.entries[start:b.pos])
	}
	return result
}

func (b *Buffer) Subscribe() (int, <-chan Entry) {
	ch := make(chan Entry, 100)
	b.mu.Lock()
	id := b.nextID
	b.nextID++
	b.subs[id] = ch
	b.mu.Unlock()
	return id, ch
}

func (b *Buffer) Unsubscribe(id int) {
	b.mu.Lock()
	if ch, ok := b.subs[id]; ok {
		delete(b.subs, id)
		close(ch)
	}
	b.mu.Unlock()
}
