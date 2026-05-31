package redis

import (
	"context"
	"fmt"
	"log"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

var Client *goredis.Client
var Ctx = context.Background()

func Connect(addr, password string) error {
	Client = goredis.NewClient(&goredis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	})

	if err := Client.Ping(Ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to redis: %w", err)
	}

	log.Println("[Redis] Connected")
	return nil
}

func SetNodeOnline(nodeID, data string) error {
	return Client.HSet(Ctx, "nodes:online", nodeID, data).Err()
}

func SetNodeOffline(nodeID string) error {
	return Client.HDel(Ctx, "nodes:online", nodeID).Err()
}

func GetOnlineNodes() (map[string]string, error) {
	return Client.HGetAll(Ctx, "nodes:online").Result()
}

func EnqueueTask(sessionID string) error {
	return Client.LPush(Ctx, "queue:tasks", sessionID).Err()
}

func DequeueTask(timeout time.Duration) (string, error) {
	result, err := Client.BRPop(Ctx, timeout, "queue:tasks").Result()
	if err != nil {
		return "", err
	}
	if len(result) < 2 {
		return "", fmt.Errorf("unexpected BRPop result: %v", result)
	}
	return result[1], nil
}

func SetSessionNode(sessionID, nodeID string) error {
	return Client.Set(Ctx, fmt.Sprintf("session:%s:node", sessionID), nodeID, 0).Err()
}

func GetSessionNode(sessionID string) (string, error) {
	return Client.Get(Ctx, fmt.Sprintf("session:%s:node", sessionID)).Result()
}

func SetSessionStatus(sessionID, status string) error {
	return Client.Set(Ctx, fmt.Sprintf("session:%s:status", sessionID), status, 0).Err()
}

func Close() {
	if Client != nil {
		Client.Close()
	}
}
