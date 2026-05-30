import axios from "axios";

const apiClient = axios.create({
  baseURL: "/api",
  timeout: 8000,
});

export default apiClient;
