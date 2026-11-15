import { api } from "../../lib/api";

export async function listUsers(params) {
  const { data } = await api.get("/auth/users/", { params });
  return data;
}

export async function createUser(payload) {
  const { data } = await api.post("/auth/users/", payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await api.patch(`/auth/users/${id}/`, payload);
  return data;
}

export async function setUserPassword(id, payload) {
  const { data } = await api.post(`/auth/users/${id}/set-password/`, payload);
  return data;
}
