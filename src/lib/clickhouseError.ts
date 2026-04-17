// src/lib/clickhouseError.ts
// ClickHouse error class with categorization and troubleshooting tips.

export type ClickHouseErrorCategory =
  | "connection"
  | "authentication"
  | "query"
  | "timeout"
  | "network"
  | "unknown";

/**
 * Error class for ClickHouse related errors.
 * Provides error categories and troubleshooting tips.
 */
export class ClickHouseError extends Error {
  category: ClickHouseErrorCategory;
  troubleshootingTips: string[];

  constructor(
    message: string,
    public readonly originalError?: unknown,
    category?: ClickHouseErrorCategory,
    troubleshootingTips?: string[],
  ) {
    super(message);
    this.name = "ClickHouseError";
    this.category = category || "unknown";
    this.troubleshootingTips = troubleshootingTips || [];
  }

  /**
   * Creates a categorized error with helpful troubleshooting tips based on the error message or status code
   */
  static fromError(
    error: any,
    defaultMessage: string = "An unknown error occurred",
  ): ClickHouseError {
    let message = error?.message || defaultMessage;
    let category: ClickHouseErrorCategory = "unknown";
    let tips: string[] = [];

    // Check for common error patterns
    const statusCode = error?.response?.status;

    // Authentication errors
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      message.includes("Authentication") ||
      message.includes("Unauthorized") ||
      message.includes("Access denied")
    ) {
      category = "authentication";
      message =
        "Authentication failed. Please check your username and password.";
      tips = [
        "Verify that your username and password are correct",
        "Ensure the user has the necessary permissions",
        "Check if the user exists in the ClickHouse server",
      ];
    }
    // Connection errors
    else if (statusCode === 404) {
      category = "connection";
      message =
        "Server not found at the specified URL. Please check your connection settings.";
      tips = [
        "Verify the URL is correct and the server is running",
        "Check if you need to use a custom path (enable Advanced Settings)",
        "Ensure no firewalls are blocking the connection",
      ];
    }
    // Proxy errors
    else if (statusCode === 502 || statusCode === 504) {
      category = "network";
      message =
        "Cannot reach the ClickHouse server. The server might be down or there's a network issue.";
      tips = [
        "Verify your ClickHouse server is running",
        "Check for network connectivity issues",
        "If using a proxy, ensure it's configured correctly",
      ];
    }
    // Timeout errors
    else if (
      statusCode === 408 ||
      message.includes("timeout") ||
      message.includes("timed out")
    ) {
      category = "timeout";
      message =
        "Connection timed out while trying to reach the ClickHouse server.";
      tips = [
        "Try increasing the request timeout value",
        "Check if the server is under heavy load",
        "Verify network latency is not causing delays",
      ];
    }
    // CORS errors
    else if (message.includes("CORS") || message.includes("Cross-Origin")) {
      category = "network";
      message =
        "Cross-Origin Request Blocked. The server doesn't allow connections from this origin.";
      tips = [
        "Check if CORS is enabled on your ClickHouse server",
        "Configure the server to accept requests from this origin",
        "If using a proxy, ensure it's forwarding CORS headers correctly",
      ];
    }
    // Network errors
    else if (
      message.includes("Network") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND")
    ) {
      category = "network";
      message =
        "Failed to connect to the server. Please check your network connection.";
      tips = [
        "Verify the server URL is accessible from your network",
        "Check for firewall or proxy restrictions",
        "Ensure the server hostname can be resolved",
      ];
    }
    // SSL errors
    else if (message.includes("SSL") || message.includes("certificate")) {
      category = "connection";
      message =
        "SSL connection failed. There might be an issue with the server's certificate.";
      tips = [
        "Check if the server's SSL certificate is valid",
        "Ensure the server name matches the certificate name",
        "Try using HTTP if HTTPS is not properly configured",
      ];
    }
    // General connection error if we can't be more specific
    else if (!message.includes("query") && !message.includes("SQL")) {
      category = "connection";
      if (message === defaultMessage) {
        message =
          "Failed to connect to the ClickHouse server. Please check your connection settings.";
      }
      tips = [
        "Verify the server URL and port are correct",
        "Check if your username and password are valid",
        "Ensure the ClickHouse server is running and accessible",
      ];
    }

    return new ClickHouseError(message, error, category, tips);
  }
}
