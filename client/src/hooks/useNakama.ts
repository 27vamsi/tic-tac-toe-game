import { useState, useEffect, useCallback, useRef } from "react";
import type { Session, Socket } from "@heroiclabs/nakama-js";
import { authenticate, getSocket, disconnectSocket, clearSession } from "../nakama";

export function useNakama() {
  const [session, setSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      setError(null);
      const sess = await authenticate();
      if (!mountedRef.current) return;
      setSession(sess);

      const sock = await getSocket();
      if (!mountedRef.current) return;

      sock.ondisconnect = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        clearReconnectTimer();
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) {
            disconnectSocket();
            connect();
          }
        }, 2000);
      };

      setSocket(sock);
      setConnected(true);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Connection failed");
      setConnected(false);
      clearSession();
      disconnectSocket();
      clearReconnectTimer();
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    }
  }, [clearReconnectTimer]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
    };
  }, [connect, clearReconnectTimer]);

  return { session, socket, connected, error, reconnect: connect };
}
