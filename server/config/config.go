package config

import (
	"os"
)

type Config struct {
	ServerPort  string
	PostgresDSN string
	RedisAddr   string
	RedisPass   string
	JWTSecret   string
}

func Load() *Config {
	return &Config{
		ServerPort:  getEnv("SERVER_PORT", "8080"),
		PostgresDSN: getEnv("POSTGRES_DSN", "postgres://myai:myai123@localhost:5432/myai?sslmode=disable"),
		RedisAddr:   getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass:   getEnv("REDIS_PASS", ""),
		JWTSecret:   getEnv("JWT_SECRET", "superco-secret-key"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
