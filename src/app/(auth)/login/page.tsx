'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const schema = z.object({
  email: z.string().email(),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setIsLoading(false);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for a magic link!');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0907] p-4 text-[#E8DCC8]">
      <div className="w-full max-w-sm space-y-8 bg-[#16130e] p-8 rounded-lg border border-[#1f1a13]">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight uppercase">U2C Beatstore</h1>
          <p className="mt-2 text-sm text-[#a08a6a]">Sign in with your email</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium uppercase text-[#4a4338] mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full bg-[#0a0907] border border-[#1f1a13] px-3 py-2 text-[#E8DCC8] placeholder-[#4a4338] focus:outline-none focus:border-[#D4BFA0] rounded"
                placeholder="you@example.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 border border-[#8A7A5C] rounded text-sm font-medium text-white bg-[#D4BFA0] hover:bg-[#8A7A5C] focus:outline-none disabled:opacity-50 transition-colors uppercase tracking-widest"
          >
            {isLoading ? 'Sending...' : 'Send Magic Link'}
          </button>

          {message && (
            <p className={`mt-4 text-center text-sm ${message.includes('Check') ? 'text-[#E8D8B8]' : 'text-red-500'}`}>
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
