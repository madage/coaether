//go:build !windows

package platform

// WSLPath returns the path unchanged on non-Windows platforms.
func WSLPath(path string) string {
	return path
}
