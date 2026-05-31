package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/superco/server/config"
	"github.com/superco/server/database"
	"github.com/superco/server/handlers"
	"github.com/superco/server/middleware"
	"github.com/superco/server/redis"
	"github.com/superco/server/services"
)

func main() {
	cfg := config.Load()

	// Database
	if err := database.Connect(cfg.PostgresDSN); err != nil {
		log.Fatalf("[FATAL] %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		log.Fatalf("[FATAL] %v", err)
	}

	// Redis
	if err := redis.Connect(cfg.RedisAddr, cfg.RedisPass); err != nil {
		log.Fatalf("[FATAL] %v", err)
	}
	defer redis.Close()

	// Services
	taskQueue := services.NewTaskQueueService()
	taskQueue.Start()
	defer taskQueue.Stop()

	// Handlers
	authH := handlers.NewAuthHandler(database.DB, cfg.JWTSecret)
	nodeH := handlers.NewNodeHandler(database.DB)
	wsHub := handlers.NewWSHub(database.DB, cfg.JWTSecret)
	sessionH := handlers.NewSessionHandler(database.DB, wsHub)

	// Router
	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Public routes
	r.POST("/api/auth/login", authH.Login)
	r.POST("/api/auth/register", authH.Register)

	// Health check
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// WebSocket routes (auth handled by token/node_id in query)
	r.GET("/ws/node", wsHub.HandleNodeWS)
	r.GET("/ws/ui", wsHub.HandleUIWS)
	r.GET("/ws/dashboard", wsHub.HandleDashboardWS)

	// Auth required
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	{
		api.GET("/nodes", nodeH.List)
		api.GET("/nodes/:id", nodeH.GetByID)
		api.POST("/nodes/register", nodeH.Register)
		api.POST("/nodes/heartbeat", nodeH.Heartbeat)
		api.GET("/nodes/:id/agents", nodeH.ListAgents)
		api.POST("/nodes/:id/scan", nodeH.TriggerScan)

		api.PATCH("/agents/:id", nodeH.UpdateAgent)

		api.POST("/sessions", sessionH.Create)
		api.GET("/sessions", sessionH.List)
		api.GET("/sessions/:id", sessionH.GetByID)
	}

	log.Printf("[Server] Starting on :%s", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("[FATAL] Failed to start server: %v", err)
	}
}
