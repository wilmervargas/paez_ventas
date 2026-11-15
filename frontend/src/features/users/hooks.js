import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, listUsers, setUserPassword, updateUser } from "./api";

export function useUsers(params) {
  return useQuery({ queryKey: ["users", params], queryFn: () => listUsers(params) });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => (id ? updateUser(id, payload) : createUser(payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useSetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => setUserPassword(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
