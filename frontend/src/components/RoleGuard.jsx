import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth-context";
export function RoleGuard({ roles, superuserOnly = false, children }) {
    const { user } = useAuth();
    if (!user) {
        return null;
    }
    if (superuserOnly && !user.is_superuser) {
        return <Navigate to="/app" replace />;
    }
    if (roles && !roles.includes(user.rol)) {
        return <Navigate to="/app" replace />;
    }
    return <>{children}</>;
}
