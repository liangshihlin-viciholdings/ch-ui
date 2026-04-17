import { useEffect, useState, ReactNode } from "react";
import { MultiStepLoader as Loader } from "@/components/ui/multi-step-loader";

declare global {
  interface Window {
    env?: {
      VITE_CLICKHOUSE_URL?: string;
      VITE_CLICKHOUSE_USER?: string;
      VITE_CLICKHOUSE_PASS?: string;
      VITE_CLICKHOUSE_DATABASE?: string;
      VITE_CLICKHOUSE_USE_ADVANCED?: boolean;
      VITE_CLICKHOUSE_CUSTOM_PATH?: string;
      VITE_CLICKHOUSE_REQUEST_TIMEOUT?: number;
      VITE_BASE_PATH?: string;
    };
  }
}
import useAppStore from "@/stores/workspaceStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { getConnectionById } from "@/lib/db";
import { toast } from "sonner";

const AppInitializer = ({ children }: { children: ReactNode }) => {
  const loadingStates = [
    {
      text: "Initializing application...",
    },
    {
      text: "Checking if you are an admin...",
    },
    {
      text: "Loading settings...",
    },
  ];

  const {
    initializeApp,
    error,
    setCredential,
    setCredentialSource,
    checkIsAdmin,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(true);
  const [envChecked, setEnvChecked] = useState(false);

  // Effect to check credentials from environment variables
  useEffect(() => {
    const initEnv = () => {
      // Check if credentials are set from environment variables
      const envUrl = window.env?.VITE_CLICKHOUSE_URL;
      const envUser = window.env?.VITE_CLICKHOUSE_USER;
      const envPass = window.env?.VITE_CLICKHOUSE_PASS;
      const envDatabase = window.env?.VITE_CLICKHOUSE_DATABASE;
      const envUseAdvanced = window.env?.VITE_CLICKHOUSE_USE_ADVANCED;
      const envCustomPath = window.env?.VITE_CLICKHOUSE_CUSTOM_PATH;
      const envRequestTimeout = window.env?.VITE_CLICKHOUSE_REQUEST_TIMEOUT;

      console.log("AppInit: Checking environment variables...");
      console.log("AppInit: envUrl:", envUrl ? "SET" : "NOT SET");
      console.log("AppInit: envUser:", envUser ? "SET" : "NOT SET");
      console.log("AppInit: envDatabase:", envDatabase ? "SET" : "NOT SET");

      if (envUrl && envUser) {
        console.log("AppInit: Setting credentials from environment variables");
        setCredential({
          url: envUrl,
          username: envUser,
          password: envPass || "",
          database: envDatabase,
          useAdvanced: envUseAdvanced || false,
          customPath: envCustomPath || "",
          requestTimeout: envRequestTimeout || 30000,
        });
        setCredentialSource("env");
      }

      // Clear window.env after reading to reduce credential exposure
      if (window.env) {
        delete window.env;
      }

      setEnvChecked(true);
    };

    initEnv();
  }, [setCredential, setCredentialSource]);

  // Effect to initialize the application after env check
  useEffect(() => {
    if (!envChecked) return;

    const init = async () => {
      try {
        // Check for last connected connection (only if no env credentials set)
        const { credential } = useAppStore.getState();
        const { activeConnectionId, setActiveConnection } = useConnectionStore.getState();

        if (activeConnectionId && !credential.url) {
          console.log("AppInit: Attempting to auto-connect to last connection:", activeConnectionId);
          try {
            const savedConnection = await getConnectionById(activeConnectionId);
            if (savedConnection) {
              console.log("AppInit: Found saved connection, connecting...");
              await setCredential({
                url: savedConnection.url,
                username: savedConnection.username,
                password: savedConnection.password,
                useAdvanced: savedConnection.useAdvanced,
                customPath: savedConnection.customPath,
                requestTimeout: savedConnection.requestTimeout,
                isDistributed: savedConnection.isDistributed,
                clusterName: savedConnection.clusterName,
              });
            }
          } catch (err) {
            console.error("AppInit: Auto-connect failed:", err);
            // Clear activeConnectionId if connection failed
            setActiveConnection(null);
          }
        }

        await initializeApp();

        // Only check admin status if client is initialized
        const { clickHouseClient } = useAppStore.getState();
        if (clickHouseClient) {
          await checkIsAdmin().catch(err => {
            console.warn("Admin check skipped:", err);
          });
        }
      } catch (err) {
        console.error("Initialization failed:", err);
        // Clear activeConnectionId if initialization failed
        const { setActiveConnection } = useConnectionStore.getState();
        setActiveConnection(null);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [envChecked, initializeApp, checkIsAdmin, setCredential]);

  // Effect to handle initialization errors
  useEffect(() => {
    if (error) {
      toast.error(`Failed to initialize application: ${error}`);
    }
  }, [error]);

  // Loading state
  if (isLoading) {
    return (
      <Loader
        loadingStates={loadingStates}
        loading={isLoading}
        duration={1000}
      />
    );
  }

  return <>{children}</>;
};

export default AppInitializer;
