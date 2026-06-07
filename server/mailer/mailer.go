package mailer

import (
	"fmt"
	"log"
	"net/smtp"
	"strings"
)

type Mailer struct {
	Host     string
	Port     string
	User     string
	Pass     string
	FromAddr string
	PublicURL string
}

func New(host, port, user, pass, fromAddr, publicURL string) *Mailer {
	return &Mailer{
		Host:      host,
		Port:      port,
		User:      user,
		Pass:      pass,
		FromAddr:  fromAddr,
		PublicURL: publicURL,
	}
}

func (m *Mailer) SendInvitation(toEmail, inviterName, workspaceName, token string) error {
	acceptURL := fmt.Sprintf("%s/invite?token=%s", m.PublicURL, token)
	subject := fmt.Sprintf("You've been invited to join %s", workspaceName)
	body := fmt.Sprintf(`Hello,

%s has invited you to join the workspace "%s".

Click the link below to accept the invitation:
%s

If you don't have an account yet, you'll be prompted to create one.

This invitation will expire in 7 days.

Best,
CoAether Team`, inviterName, workspaceName, acceptURL)

	if m.Host == "" {
		log.Printf("[Mailer] SMTP not configured. Invitation link for %s: %s", toEmail, acceptURL)
		return nil
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		m.FromAddr, toEmail, subject, body)

	addr := fmt.Sprintf("%s:%s", m.Host, m.Port)
	auth := smtp.PlainAuth("", m.User, m.Pass, m.Host)

	err := smtp.SendMail(addr, auth, m.FromAddr, []string{toEmail}, []byte(msg))
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}
	log.Printf("[Mailer] Invitation sent to %s", toEmail)
	return nil
}

func (m *Mailer) IsConfigured() bool {
	return m.Host != "" && m.User != ""
}

// GenerateInvitationLink returns the accept URL without sending email.
func (m *Mailer) GenerateInvitationLink(token string) string {
	return fmt.Sprintf("%s/invite?token=%s", m.PublicURL, token)
}

// SendNotification sends a notification email to the given address.
func (m *Mailer) SendNotification(toEmail, subject, body string) error {
	if m.Host == "" {
		log.Printf("[Mailer] SMTP not configured. Notification for %s: %s", toEmail, subject)
		return nil
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		m.FromAddr, toEmail, subject, body)

	addr := fmt.Sprintf("%s:%s", m.Host, m.Port)
	auth := smtp.PlainAuth("", m.User, m.Pass, m.Host)

	err := smtp.SendMail(addr, auth, m.FromAddr, []string{toEmail}, []byte(msg))
	if err != nil {
		return fmt.Errorf("failed to send notification email: %w", err)
	}
	log.Printf("[Mailer] Notification sent to %s: %s", toEmail, subject)
	return nil
}

// ExtractNameFromEmail returns the part before @ as a display name.
func ExtractNameFromEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) > 0 && parts[0] != "" {
		return parts[0]
	}
	return "user"
}
