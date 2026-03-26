"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { authClient } from "~/server/better-auth/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function SignInButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  // simple styled button mode — just triggers google oauth
  if (className || children) {
    return (
      <button
        className={className}
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: "/browse",
          })
        }
      >
        {children ?? "Sign in with Google"}
      </button>
    );
  }

  return <SignInForm />;
}

function SignInForm() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setError("");

    try {
      if (isSignUp) {
        if (!values.name) {
          form.setError("name", { message: "Name is required" });
          return;
        }
        const { name, email, password } = values;
        const result = await authClient.signUp.email({
          email,
          password,
          name: name,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign up failed");
        } else {
          router.push("/browse/new");
        }
      } else {
        const result = await authClient.signIn.email({
          email: values.email,
          password: values.password,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed");
        } else {
          router.push("/browse/new");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {isSignUp && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            size="lg"
            className="mt-1 w-full text-lg"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? "Loading..."
              : isSignUp
                ? "Sign Up"
                : "Sign In"}
          </Button>
        </form>
      </Form>

      <button
        type="button"
        onClick={() => {
          setIsSignUp(!isSignUp);
          setError("");
          form.clearErrors();
        }}
        className="text-sm text-muted-foreground underline"
      >
        {isSignUp
          ? "Already have an account? Sign in"
          : "Don't have an account? Sign up"}
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-sm text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full text-lg"
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: "/browse/new",
          })
        }
      >
        Sign in with Google
      </Button>
    </div>
  );
}
