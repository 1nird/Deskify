import { useState, useEffect } from "react";
import { getAppVersion } from "@/lib";

export const useVersion = () => {
  const [version, setVersion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        setIsLoading(true);
        await getAppVersion();
        setVersion("2.0.1"); // Hardcoded for testing updater UI
        setError(null);
      } catch (err) {
        console.error("Failed to fetch version:", err);
        setError("Failed to load version");
        setVersion("Unknown");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersion();
  }, []);

  return { version, isLoading, error };
};
