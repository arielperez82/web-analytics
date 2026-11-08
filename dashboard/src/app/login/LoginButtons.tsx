"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export const LoginButtons = ({ google, dev }: { google: boolean; dev: boolean }) => {
  const [email, setEmail] = useState("");
  return (
    <div className="stack">
      {google && (
        <button onClick={() => signIn("google", { callbackUrl: "/" })}>
          Sign in with Google
        </button>
      )}
      {dev && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn("dev-login", { email, callbackUrl: "/" });
          }}
        >
          <input
            type="email"
            placeholder="dev login email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button type="submit">Dev login</button>
        </form>
      )}
    </div>
  );
};
