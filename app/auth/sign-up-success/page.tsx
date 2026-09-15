import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpSuccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Check your email</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>If registration was accepted, we sent a confirmation link. Open it to finish signing up, then sign in.</p>
          <p className="text-sm text-muted-foreground">Check your spam folder too. If you already have an account, you can sign in.</p>
          <Link className="block underline underline-offset-4" href="/auth/login">Go to login</Link>
          <Link className="block underline underline-offset-4" href="/auth/sign-up">Back to signup</Link>
        </CardContent>
      </Card>
    </main>
  );
}
