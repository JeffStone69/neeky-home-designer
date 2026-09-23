import { mount } from "./app.js";

export { mount };

window.__NEEKY_MOUNT__ = mount;

if (document.getElementById("neeky-root") && !window.__NEEKY_REACT__) {
  mount(document.getElementById("neeky-root"));
}
