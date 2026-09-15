import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Unable to confirm your email</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>The link may have expired or already been used. Open the latest email in the browser where you signed up.</p>
          <p className="text-sm text-muted-foreground">If you already confirmed your email, try signing in. Otherwise, return to signup to request confirmation again.</p>
          <Link className="block underline underline-offset-4" href="/auth/login">Go to login</Link>
          <Link className="block underline underline-offset-4" href="/auth/sign-up">Back to signup</Link>
        </CardContent>
      </Card>
    </main>
  );
}
