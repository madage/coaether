package backends

import (
	"fmt"
	"time"

	"github.com/coaether/server/protocol"
)

// EchoBackend is a simple test backend that echoes back messages.
type EchoBackend struct{}

func NewEchoBackend() *EchoBackend {
	return &EchoBackend{}
}

func (b *EchoBackend) Name() string    { return "Echo" }
func (b *EchoBackend) Version() string { return "1.0.0" }
func (b *EchoBackend) Evaluate(prompt string) (string, error) {
	return "REPLY: Acknowledged via Echo backend.", nil
}

func (b *EchoBackend) HandleMessage(env *protocol.Envelope) (*protocol.Envelope, error) {
	content := env.Payload.Content
	if len(content) == 0 {
		content = []protocol.ContentBlock{protocol.TextBlock("(empty message)")}
	}

	// Echo back with a prefix
	echo := protocol.NewEnvelope("", "", protocol.MsgMessage, &protocol.Payload{
		Content: []protocol.ContentBlock{
			protocol.StatusBlock("echo", "gray"),
			protocol.TextBlock(fmt.Sprintf("Echo at %s:", time.Now().Format(time.RFC3339))),
		},
	})
	echo.Payload.Content = append(echo.Payload.Content, content...)
	return echo, nil
}
