const PASSWORD = "1406";

const passInput = document.getElementById("passInput");
const unlockBtn = document.getElementById("unlockBtn");
const lockError = document.getElementById("lockError");

function unlock() {
  if (passInput.value.trim() === PASSWORD) {
    window.location.href = "app.html";
  } else {
    lockError.textContent = "Code incorrect";
    passInput.classList.add("shake");
    setTimeout(() => passInput.classList.remove("shake"), 400);
  }
}

unlockBtn.addEventListener("click", unlock);
passInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlock();
});
