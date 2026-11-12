import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth-context";
export function RoleGuard({ roles, children }) {
    const { user } = useAuth();
    if (!user) {
        return null;
    }
    if (!roles.includes(user.rol)) {
        return <Navigate to="/app" replace/>;
    }
    return <>{children}</>;
}
