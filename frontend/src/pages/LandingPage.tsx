import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Lock,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

interface EntryCard {
  key: string;
  badge: string;
  title: string;
  description: string;
  capabilities: string[];
  cta: string;
}

const ENTRY_CARDS: EntryCard[] = [
  {
    key: 'staff',
    badge: 'For Internal Use',
    title: 'Internal Staff',
    description: 'Access the RMA Masterfile, process delivery notes, review requests, and manage internal operations.',
    capabilities: [
      'Process and manage delivery notes',
      'Manage RMA Masterfile',
      'Review incoming RMA requests',
    ],
    cta: 'Staff Sign In',
  },
  {
    key: 'requester',
    badge: 'For RMA Requesters',
    title: 'Requester',
    description: 'Submit a new RMA request and track the status of your existing requests.',
    capabilities: ['Submit RMA requests', 'Track request status', 'Receive request updates'],
    cta: 'Continue as Requester',
  },
];

const VALUE_HIGHLIGHTS = [
  { icon: CheckCircle2, title: 'Accurate Records', description: 'Reliable and up-to-date masterfile management' },
  { icon: Zap, title: 'End-to-End Process', description: 'Streamlined workflow from intake to resolution' },
  { icon: ShieldCheck, title: 'Secure & Trusted', description: 'Role-based access with enterprise-grade security' },
];

const TRUST_STRIP = [
  { icon: Lock, title: 'Secure Access', description: 'Role-based access keeps your data safe.' },
  { icon: ShieldCheck, title: 'Data Integrity', description: 'Accurate and validated records you can trust.' },
  { icon: Clock, title: 'Process Efficiency', description: 'Faster turnaround with automated workflows.' },
  { icon: Users, title: 'Built for Your Team', description: 'Designed to support both internal teams and requesters.' },
];

export function LandingPage() {
  const { isAuthenticated, isLoading, role } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={role === 'requester' ? '/portal' : '/home'} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Hero -- brand gradient is the always-rendered base layer; the photo is a
          separate absolutely-positioned layer on top so a missing/404 image never
          blanks out the background (drop the reference photo at
          frontend/public/landingpage.png to activate it). */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1a8a4f] via-[#0f4a2c] to-[#071a10] px-4 pb-20 pt-14 text-center md:pt-20">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('/landingpage.png')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-[#071a10]/80" aria-hidden="true" />

        <img
          src="/infineon.png"
          alt="Infineon"
          className="absolute left-4 top-4 h-8 w-auto brightness-0 invert drop-shadow-lg md:h-10"
        />

        <div className="relative">
          <h1 className="mt-6 text-3xl font-bold text-white md:text-5xl">
            RMA Masterfile
            <br />
            <span className="bg-gradient-to-r from-[#1a8a4f] via-[#5eead4] to-[#0f4a2c] bg-clip-text text-transparent">
              Automation System
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/80 md:text-base">
            One system to process delivery notes, manage the RMA masterfile, and submit and track
            return requests — from intake through resolution.
          </p>

          <div className="mx-auto mt-8 h-px w-full max-w-3xl bg-white/15" aria-hidden="true" />

          <div className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-3">
            {VALUE_HIGHLIGHTS.map((v) => (
              <div key={v.title} className="flex items-start gap-2 text-left">
                <v.icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold text-white">{v.title}</p>
                  <p className="text-xs text-white/70">{v.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Curved white transition into the card section */}
        <svg
          className="absolute inset-x-0 bottom-0 h-12 w-full text-slate-50 dark:text-slate-950"
          viewBox="0 0 1440 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,60 C360,10 1080,10 1440,60 L1440,60 L0,60 Z" fill="currentColor" />
        </svg>
      </div>

      {/* Entry cards */}
      <div className="relative z-10 mx-auto -mt-6 grid max-w-4xl gap-6 px-4 sm:grid-cols-2 md:-mt-10">
        {ENTRY_CARDS.map((card) => (
          <Card key={card.key} className="border-slate-200 shadow-lg dark:border-slate-800">
            <CardContent className="flex h-full flex-col gap-4 p-6 md:p-7">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Users className="h-6 w-6" />
                </div>
                <Badge variant="pdf">{card.badge}</Badge>
              </div>

              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{card.title}</p>
                <p className="mt-1 text-sm text-slate-500">{card.description}</p>
              </div>

              <ul className="space-y-1.5">
                {card.capabilities.map((cap) => (
                  <li key={cap} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {cap}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-auto w-full justify-between"
                onClick={() => navigate(card.key === 'requester' ? '/portal' : '/login')}
              >
                {card.cta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trust / value strip */}
      <div className="mx-auto mt-10 max-w-4xl px-4">
        <div className="grid gap-6 rounded-2xl bg-emerald-50 p-6 dark:bg-emerald-950/40 sm:grid-cols-2 md:grid-cols-4">
          {TRUST_STRIP.map((item) => (
            <div key={item.title} className="flex items-start gap-2">
              <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 border-t border-slate-200 px-4 py-6 dark:border-slate-800">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                RMA Masterfile Automation System
              </p>
              <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} All rights reserved.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Project Manager: Mark Davis (BE QM MP SIN QE)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
