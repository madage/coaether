//go:build windows

package platform

func NewPTY() PTY {
	return NewWindowsPTY()
}
