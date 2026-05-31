//go:build !windows

package main

import "runtime"

func osPlatform() string {
	return runtime.GOOS
}
