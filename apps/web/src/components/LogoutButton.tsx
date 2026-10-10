"use client";

import { logout } from "../app/login/actions.js";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button className="btn small" type="submit" style={{ width: "100%", justifyContent: "center" }}>
        Sign out
      </button>
    </form>
  );
}
