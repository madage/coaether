package plugin

import (
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// RegisterPluginRoutes registers plugin management and reverse proxy routes.
// Management routes are handled explicitly; all other paths are proxied to plugins.
func RegisterPluginRoutes(
	r *gin.RouterGroup,
	mgr *Manager,
	hostSvc *HostService,
	h interface {
		List(c *gin.Context)
		Get(c *gin.Context)
		Start(c *gin.Context)
		Stop(c *gin.Context)
		Reload(c *gin.Context)
		Remove(c *gin.Context)
		HealthCheck(c *gin.Context)
		InstallUpload(c *gin.Context)
		InstallGit(c *gin.Context)
	},
) {
	// Plugin list — no conflict with param routes
	r.GET("/plugins", h.List)

	// Plugin host internal API
	hostSvc.RegisterRoutes(r)

	// Combined management + proxy handler.
	// Gin cannot register both explicit param routes and a catch-all at the same
	// prefix (e.g. /plugins/:name + /plugins/:name/*proxyPath). This single handler
	// manually dispatches management actions and proxies everything else.
	// Install actions (upload/git) are also dispatched here since Gin's tree does
	// not always prioritize static routes over a param+catch-all at the same level.
	r.Any("/plugins/:name/*proxyPath", combinedHandler(mgr, h))
}

func combinedHandler(
	mgr *Manager,
	h interface {
		Get(c *gin.Context)
		Start(c *gin.Context)
		Stop(c *gin.Context)
		Reload(c *gin.Context)
		Remove(c *gin.Context)
		HealthCheck(c *gin.Context)
		InstallUpload(c *gin.Context)
		InstallGit(c *gin.Context)
	},
) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("name")
		proxyPath := c.Param("proxyPath")
		action := strings.TrimPrefix(proxyPath, "/")

		switch action {
		case "":
			h.Get(c)
			return
		case "start":
			h.Start(c)
			return
		case "stop":
			h.Stop(c)
			return
		case "reload":
			h.Reload(c)
			return
		case "remove":
			h.Remove(c)
			return
		case "health":
			h.HealthCheck(c)
			return
		case "upload":
			h.InstallUpload(c)
			return
		case "git":
			h.InstallGit(c)
			return
		}

		// Not a management action — proxy to plugin
		targetURL := mgr.ProxyURL(name)
		if targetURL == "" {
			c.JSON(502, gin.H{"error": "plugin not available or not running"})
			c.Abort()
			return
		}

		target, err := url.Parse(targetURL)
		if err != nil {
			c.JSON(500, gin.H{"error": "invalid proxy target"})
			c.Abort()
			return
		}

		proxy := httputil.NewSingleHostReverseProxy(target)

		c.Request.URL.Path = proxyPath
		c.Request.URL.RawPath = proxyPath
		c.Request.Header.Set("X-Plugin-Id", name)
		c.Request.Header.Set("X-Forwarded-Host", c.Request.Host)

		proxy.ServeHTTP(c.Writer, c.Request)
	}
}
