//go:build darwin || linux

package platform

func NewPTY() PTY {
	return NewUnixPTY()
}
