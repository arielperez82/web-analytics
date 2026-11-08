import { LoginButtons } from "./LoginButtons";

const LoginPage = () => (
  <main className="login">
    <h1>Web Analytics</h1>
    <LoginButtons
      google={Boolean(process.env.GOOGLE_CLIENT_ID)}
      dev={
        process.env.DASHBOARD_DEV_LOGIN === "1" &&
        process.env.NODE_ENV !== "production"
      }
    />
  </main>
);

export default LoginPage;
