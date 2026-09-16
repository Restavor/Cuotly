import { createContext, useContext } from "react";
import { useNetworkState } from "expo-network";

/**
 * RN-MOV-09 · si hay conexión ahora mismo. Lo dice el sistema (expo-network);
 * la app no lo adivina por un fallo de red suelto, que puede ser del
 * servidor y no del teléfono.
 *
 * `null` mientras el sistema no ha contestado todavía: se trata como
 * conectado para no deshabilitar botones sin motivo.
 */
const ConnectivityContext = createContext<boolean>(true);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const state = useNetworkState();
  const online = state.isConnected === null || state.isConnected === undefined ? true : state.isConnected && state.isInternetReachable !== false;
  return <ConnectivityContext.Provider value={online}>{children}</ConnectivityContext.Provider>;
}

export function useOnline(): boolean {
  return useContext(ConnectivityContext);
}
