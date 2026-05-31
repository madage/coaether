package services

import (
	"log"
	"time"

	"github.com/superco/server/redis"
)

type TaskQueueService struct {
	stopCh chan struct{}
}

func NewTaskQueueService() *TaskQueueService {
	return &TaskQueueService{
		stopCh: make(chan struct{}),
	}
}

func (s *TaskQueueService) Start() {
	go func() {
		log.Println("[TaskQueue] Worker started")
		for {
			select {
			case <-s.stopCh:
				return
			default:
				taskID, err := redis.DequeueTask(5 * time.Second)
				if err != nil {
					continue
				}
				log.Printf("[TaskQueue] Dequeued task: %s", taskID)
				// In MVP, the task assignment is handled via WebSocket
				// The actual execution happens on the Agent Node side
			}
		}
	}()
}

func (s *TaskQueueService) Stop() {
	close(s.stopCh)
	log.Println("[TaskQueue] Worker stopped")
}
