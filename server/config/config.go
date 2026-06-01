package config

import (
	"os"
	"strings"
)

func init() {
	// Load .env file automatically if present
	data, err := os.ReadFile(".env")
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 && os.Getenv(parts[0]) == "" {
			os.Setenv(parts[0], parts[1])
		}
	}
}

type Config struct {
	ServerPort  string
	PostgresDSN string
	JWTSecret   string
}

func Load() *Config {
	return &Config{
		ServerPort:  getEnv("SERVER_PORT", "8088"),
		PostgresDSN: getEnvOrFail("POSTGRES_DSN"),
		JWTSecret:   getEnvOrFail("JWT_SECRET"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvOrFail(key string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	panic("Environment variable " + key + " is required but not set")
}
