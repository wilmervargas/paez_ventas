import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import { FullPageLoader } from "./ui/Spinner";
export function ProtectedRoute({ children }) {
    const { status } = useAuth();
    const location = useLocation();
    if (status === "loading") {
        return <FullPageLoader label="Restaurando sesión..."/>;
    }
    if (status === "anonymous") {
        return <Navigate to="/login" replace state={{ from: location }}/>;
    }
    return <>{children}</>;
}
