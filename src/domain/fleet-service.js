import { functions, httpsCallable } from "../firebase.js";

const call = name => httpsCallable(functions, name);
async function invoke(name, payload) {
  const result = await call(name)(payload);
  return result.data;
}

export async function createDriver(data) {
  return invoke("adminCreateDriver", data);
}
export async function updateDriver(data) {
  return invoke("adminUpdateDriver", data);
}
export async function createCar(data) {
  return invoke("adminCreateCar", data);
}
export async function updateCar(data) {
  return invoke("adminUpdateCar", data);
}
export async function assignCarDrivers(data) {
  return invoke("adminAssignCarDrivers", data);
}
export async function deactivateDriver(data) {
  return invoke("adminDeactivateDriver", data);
}
export async function deactivateCar(data) {
  return invoke("adminDeactivateCar", data);
}
