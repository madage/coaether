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
		ServerPort:  getEnv("SERVER_PORT", "8088"),
		PostgresDSN: getEnvOrFail("POSTGRES_DSN"),
		RedisAddr:   getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass:   getEnv("REDIS_PASS", ""),
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
