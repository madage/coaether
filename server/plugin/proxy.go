package plugin

import (
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// managementRoutes returns the set of known management sub-paths.
// Used by the combined plugin router to distinguish management calls from proxied calls.
var managementRoutes = map[string]bool{
	"":       true, // GET /plugins/:id (detail)
	"start":  true,
	"stop":   true,
	"reload": true,
	"health": true,
}

// CombinedPluginHandler registers both management and proxy routes for plugins.
// Management routes are registered explicitly; everything else is proxied.
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
		HealthCheck(c *gin.Context)
	},
) {
	// Management API (explicit routes take priority)
	r.GET("/plugins", h.List)
	r.GET("/plugins/:id", h.Get)
	r.POST("/plugins/:id/start", h.Start)
	r.POST("/plugins/:id/stop", h.Stop)
	r.POST("/plugins/:id/reload", h.Reload)
	r.GET("/plugins/:id/health", h.HealthCheck)

	// Plugin host internal API
	hostSvc.RegisterRoutes(r)

	// Plugin reverse proxy: everything under /api/plugins/{name}/ that
	// isn't a management route gets forwarded to the plugin's HTTP server.
	r.Any("/plugins/:name/*proxyPath", reverseProxyHandler(mgr))
}

func reverseProxyHandler(mgr *Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("name")
		proxyPath := c.Param("proxyPath")

		// If the "action" part of the path is a known management route, skip proxying.
		// Gin's router handles this naturally for specific routes, but this catch-all
		// also matches GET /plugins/:name without a sub-path. Only proxy if there's
		// a sub-path that isn't a management route.
		action := strings.TrimPrefix(proxyPath, "/")
		if managementRoutes[action] {
			c.Next() // skip — let the registered management handler handle it
			return
		}

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

		// Rewrite path: the proxy path already starts with /
		c.Request.URL.Path = proxyPath
		c.Request.URL.RawPath = proxyPath
		c.Request.Header.Set("X-Plugin-Id", name)
		c.Request.Header.Set("X-Forwarded-Host", c.Request.Host)

		proxy.ServeHTTP(c.Writer, c.Request)
	}
}
