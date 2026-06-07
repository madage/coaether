package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// TaskAnnotatorPlugin adds custom annotations to tasks.
type TaskAnnotatorPlugin struct {
	mu       sync.RWMutex
	db       *sql.DB
	pluginID string
	dataDir  string
	startAt  time.Time
}

type Annotation struct {
	ID        string `json:"id"`
	TaskID    string `json:"task_id"`
	Content   string `json:"content"`
	Color     string `json:"color"`
	CreatedAt string `json:"created_at"`
}

func main() {
	p := &TaskAnnotatorPlugin{
		startAt: time.Now(),
	}
	p.pluginID = os.Getenv("COAETHER_PLUGIN_ID")

	mux := http.NewServeMux()

	// Lifecycle
	mux.HandleFunc("/__plugin/init", p.handleInit)
	mux.HandleFunc("/__plugin/health", p.handleHealth)
	mux.HandleFunc("/__plugin/hook", p.handleHook)
	mux.HandleFunc("/__plugin/shutdown", p.handleShutdown)

	// Business API
	mux.HandleFunc("/annotations", p.handleAnnotations)
	mux.HandleFunc("/annotations/", p.handleAnnotationByID)

	// Start HTTP server
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	json.NewEncoder(os.Stdout).Encode(map[string]int{"port": port})
	log.Printf("[Annotator] Started on port %d", port)

	if err := http.Serve(listener, mux); err != nil {
		log.Printf("[Annotator] Server error: %v", err)
	}
}

func (p *TaskAnnotatorPlugin) handleInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PluginID string `json:"plugin_id"`
		DataDir  string `json:"data_dir"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	p.pluginID = req.PluginID
	p.dataDir = req.DataDir

	// Initialize SQLite database
	dbPath := p.dataDir + "/annotations.db"
	var err error
	p.db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Printf("[Annotator] DB open failed: %v", err)
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Create table
	p.db.Exec(`CREATE TABLE IF NOT EXISTS annotations (
		id        TEXT PRIMARY KEY,
		task_id   TEXT NOT NULL,
		content   TEXT NOT NULL DEFAULT '',
		color     TEXT NOT NULL DEFAULT '#ffeb3b',
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`)
	p.db.Exec(`CREATE INDEX IF NOT EXISTS idx_annotations_task ON annotations(task_id)`)

	log.Printf("[Annotator] Initialized: dataDir=%s", p.dataDir)
	json.NewEncoder(w).Encode(map[string]bool{"ready": true})
}

func (p *TaskAnnotatorPlugin) handleHealth(w http.ResponseWriter, r *http.Request) {
	healthy := p.db != nil
	uptime := time.Since(p.startAt).Milliseconds()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"healthy":   healthy,
		"message":   "ok",
		"uptime_ms": uptime,
	})
}

func (p *TaskAnnotatorPlugin) handleShutdown(w http.ResponseWriter, r *http.Request) {
	log.Println("[Annotator] Shutting down...")
	if p.db != nil {
		p.db.Close()
	}
	w.WriteHeader(200)
	go func() {
		time.Sleep(200 * time.Millisecond)
		os.Exit(0)
	}()
}

// handleHook processes lifecycle hooks from the host
func (p *TaskAnnotatorPlugin) handleHook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		HookName string            `json:"hook_name"`
		Context  map[string]string `json:"context"`
		Async    bool              `json:"async"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	resp := map[string]interface{}{
		"aborted": false,
	}

	switch req.HookName {
	case "task:created":
		taskID := req.Context["task_id"]
		if req.Async {
			go p.onTaskCreated(taskID)
		} else {
			p.onTaskCreated(taskID)
		}
	case "task:deleted":
		taskID := req.Context["task_id"]
		go p.onTaskDeleted(taskID)
	}

	json.NewEncoder(w).Encode(resp)
}

// onTaskCreated auto-creates an annotation placeholder for new tasks.
func (p *TaskAnnotatorPlugin) onTaskCreated(taskID string) {
	if p.db == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	_, err := p.db.Exec(
		`INSERT OR IGNORE INTO annotations (id, task_id, content, color)
		 VALUES (hex(randomblob(16)), $1, '', '#ffeb3b')`,
		taskID,
	)
	if err != nil {
		log.Printf("[Annotator] Failed to create annotation for task %s: %v", taskID, err)
	} else {
		log.Printf("[Annotator] Auto-created annotation for task %s", taskID)
	}
}

// onTaskDeleted cleans up annotations when a task is deleted.
func (p *TaskAnnotatorPlugin) onTaskDeleted(taskID string) {
	if p.db == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	p.db.Exec("DELETE FROM annotations WHERE task_id = $1", taskID)
	log.Printf("[Annotator] Deleted annotations for task %s", taskID)
}

// handleAnnotations serves the annotations API.
// GET /annotations?task_id=xxx  — list annotations for a task
// POST /annotations            — create/update an annotation
func (p *TaskAnnotatorPlugin) handleAnnotations(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		p.listAnnotations(w, r)
	case http.MethodPost:
		p.saveAnnotation(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, 405)
	}
}

func (p *TaskAnnotatorPlugin) listAnnotations(w http.ResponseWriter, r *http.Request) {
	taskID := r.URL.Query().Get("task_id")
	if taskID == "" {
		http.Error(w, `{"error":"task_id required"}`, 400)
		return
	}

	if p.db == nil {
		http.Error(w, `{"error":"not initialized"}`, 503)
		return
	}

	p.mu.RLock()
	defer p.mu.RUnlock()

	rows, err := p.db.Query(
		"SELECT id, task_id, content, color, created_at FROM annotations WHERE task_id = $1 ORDER BY created_at",
		taskID,
	)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, 500)
		return
	}
	defer rows.Close()

	var annotations []Annotation
	for rows.Next() {
		var a Annotation
		if err := rows.Scan(&a.ID, &a.TaskID, &a.Content, &a.Color, &a.CreatedAt); err == nil {
			annotations = append(annotations, a)
		}
	}
	if annotations == nil {
		annotations = []Annotation{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"annotations": annotations,
		"total":       len(annotations),
	})
}

func (p *TaskAnnotatorPlugin) saveAnnotation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TaskID  string `json:"task_id"`
		Content string `json:"content"`
		Color   string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, 400)
		return
	}
	if req.TaskID == "" {
		http.Error(w, `{"error":"task_id required"}`, 400)
		return
	}

	if p.db == nil {
		http.Error(w, `{"error":"not initialized"}`, 503)
		return
	}

	color := req.Color
	if color == "" {
		color = "#ffeb3b"
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	_, err := p.db.Exec(
		`UPDATE annotations SET content = $1, color = $2 WHERE task_id = $3`,
		req.Content, color, req.TaskID,
	)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, 500)
		return
	}

	// If no rows updated, insert new
	var id string
	err = p.db.QueryRow(
		"SELECT id FROM annotations WHERE task_id = $1", req.TaskID,
	).Scan(&id)
	if err == sql.ErrNoRows {
		p.db.Exec(
			`INSERT INTO annotations (id, task_id, content, color)
			 VALUES (hex(randomblob(16)), $1, $2, $3)`,
			req.TaskID, req.Content, color,
		)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "saved",
		"task_id": req.TaskID,
	})
}

func (p *TaskAnnotatorPlugin) handleAnnotationByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, 405)
		return
	}

	// DELETE /annotations/{id}
	id := r.URL.Path[len("/annotations/"):]
	if id == "" {
		http.Error(w, `{"error":"id required"}`, 400)
		return
	}

	if p.db == nil {
		http.Error(w, `{"error":"not initialized"}`, 503)
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	_, err := p.db.Exec("DELETE FROM annotations WHERE id = $1", id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, 500)
		return
	}

	json.NewEncoder(w).Encode(map[string]bool{"deleted": true})
}

// callHost is a helper to call the host API.
func (p *TaskAnnotatorPlugin) callHost(method, path string, body io.Reader) (*http.Response, error) {
	hostAddr := os.Getenv("COAETHER_HOST_ADDR")
	req, err := http.NewRequest(method, "http://"+hostAddr+"/__plugin_host"+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Plugin-Id", p.pluginID)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return http.DefaultClient.Do(req)
}
