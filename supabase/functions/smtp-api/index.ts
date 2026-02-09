import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMTP_API_URL = 'https://api.smtp.dev';

// Batch size for parallel processing
const ACCOUNT_BATCH_SIZE = 10;

// ============================================================
// DASHER INTELLIGENCE ENGINE — Pattern Engine + State Machine
// ============================================================

// All known DoorDash/Dasher email categories and sub-patterns
const PATTERN_ENGINE: Array<{
  category: string;
  sub_category: string;
  patterns: RegExp[];
  senders?: RegExp[];
  extract?: RegExp;
}> = [
  // --- REGISTRATION ---
  { category: 'REGISTRATION', sub_category: 'welcome', patterns: [/welcome to doordash/i, /welcome,?\s*dasher/i] },
  { category: 'REGISTRATION', sub_category: 'signup', patterns: [/complete your (dasher )?sign\s*up/i, /finish (your |setting up )/i] },
  { category: 'REGISTRATION', sub_category: 'create_account', patterns: [/create your (dasher )?account/i, /account created/i] },

  // --- VERIFICATION ---
  { category: 'VERIFICATION', sub_category: 'code', patterns: [/verification code/i, /verify code/i, /your code is/i], extract: /(\d{4,6})/ },
  { category: 'VERIFICATION', sub_category: 'confirm_email', patterns: [/confirm your email/i, /verify your email/i, /email verification/i] },
  { category: 'VERIFICATION', sub_category: 'confirm_identity', patterns: [/confirm your identity/i, /verify your identity/i, /identity verification/i] },
  { category: 'VERIFICATION', sub_category: 'confirm_phone', patterns: [/confirm your phone/i, /verify your phone/i] },

  // --- BGC (Background Check) ---
  { category: 'BGC', sub_category: 'bgc_started', patterns: [/background check.*(ready|begin|start|initiated)/i] },
  { category: 'BGC', sub_category: 'bgc_processing', patterns: [/background check.*(processing|progress|running|pending)/i] },
  { category: 'BGC', sub_category: 'bgc_clear', patterns: [/background check.*(complete|clear|passed|ready to dash|approved)/i, /your background check is complete/i] },
  { category: 'BGC', sub_category: 'bgc_issue', patterns: [/background check.*(issue|problem|unable|denied|fail|delay|review|hold)/i] },
  { category: 'BGC', sub_category: 'checkr', patterns: [/checkr/i], senders: [/checkr\.com/i] },

  // --- ONBOARDING ---
  { category: 'ONBOARDING', sub_category: 'red_card', patterns: [/red card.*(on the way|shipped|deliver|mail)/i, /your (dasher )?red card/i] },
  { category: 'ONBOARDING', sub_category: 'activation_kit', patterns: [/activation kit/i, /starter kit/i, /welcome kit/i] },
  { category: 'ONBOARDING', sub_category: 'get_started', patterns: [/get started.*(dash|deliver)/i, /ready to (start )?dash/i, /start dashing/i] },
  { category: 'ONBOARDING', sub_category: 'orientation', patterns: [/orientation/i, /training/i, /learn to dash/i, /how to dash/i] },
  { category: 'ONBOARDING', sub_category: 'profile_complete', patterns: [/complete your (dasher )?profile/i, /profile.*(complete|update)/i] },

  // --- ACTIVE (Earnings/Dash Activity) ---
  { category: 'ACTIVE', sub_category: 'earnings_summary', patterns: [/(weekly|daily|monthly) (earnings?|pay|summary)/i, /earnings? (summary|report|update)/i] },
  { category: 'ACTIVE', sub_category: 'earnings_amount', patterns: [/you earned \$/i, /you('ve| have) earned/i], extract: /\$([\d,.]+)/ },
  { category: 'ACTIVE', sub_category: 'dash_opportunity', patterns: [/dash now/i, /busy in your area/i, /high demand/i, /dash.*opportunity/i] },
  { category: 'ACTIVE', sub_category: 'pay_deposited', patterns: [/your pay (is|has been) (on the way|deposited|sent)/i, /pay.*deposited/i, /deposit.*processed/i] },
  { category: 'ACTIVE', sub_category: 'direct_deposit', patterns: [/direct deposit/i, /bank transfer/i] },
  { category: 'ACTIVE', sub_category: 'top_dasher', patterns: [/top dasher/i, /dasher of the/i] },
  { category: 'ACTIVE', sub_category: 'first_dash', patterns: [/your first dash/i, /first (delivery|order|dash)/i, /first dash,?\s*done/i] },
  { category: 'ACTIVE', sub_category: 'dash_stats', patterns: [/your dash(ing)? stats/i, /delivery stats/i, /performance/i] },

  // --- WARNING ---
  { category: 'WARNING', sub_category: 'account_warning', patterns: [/important.*(?:your|dasher) (?:account|dasher)/i, /account.*important/i] },
  { category: 'WARNING', sub_category: 'contract_violation', patterns: [/contract violation/i, /violation notice/i] },
  { category: 'WARNING', sub_category: 'late_delivery', patterns: [/extremely late/i, /late delivery/i, /delivery.*late/i] },
  { category: 'WARNING', sub_category: 'safety_concern', patterns: [/safety concern/i, /safety violation/i] },
  { category: 'WARNING', sub_category: 'low_rating', patterns: [/rating.*(low|drop|declin)/i, /low.*rating/i, /customer rating/i] },
  { category: 'WARNING', sub_category: 'flagged', patterns: [/flagged|under review|review.*account/i] },
  { category: 'WARNING', sub_category: 'missing_items', patterns: [/missing item/i, /item.*missing/i, /order.*missing/i] },

  // --- DEACTIVATION ---
  { category: 'DEACTIVATION', sub_category: 'deactivated', patterns: [/deactivat(ed|ion)/i, /account.*(deactivat|terminat)/i] },
  { category: 'DEACTIVATION', sub_category: 'suspended', patterns: [/account.*(suspended|disabled|locked)/i, /suspended/i] },

  // --- APPEAL ---
  { category: 'APPEAL', sub_category: 'appeal_info', patterns: [/appeal.*deactivation/i, /how to appeal/i, /appeal process/i] },
  { category: 'APPEAL', sub_category: 'appeal_submitted', patterns: [/appeal.*(submitted|received|processing)/i] },
  { category: 'APPEAL', sub_category: 'appeal_result', patterns: [/appeal.*(reviewed|decision|denied|approved|rejected|accepted)/i] },

  // --- PACKAGE (Welcome Gift / First Package) ---
  { category: 'PACKAGE', sub_category: 'welcome_gift', patterns: [/welcome gift/i, /dasher welcome/i, /congratulations.*gift/i] },
  { category: 'PACKAGE', sub_category: 'package_shipped', patterns: [/(package|shipment|order).*(shipped|tracking|on.*way)/i] },
  { category: 'PACKAGE', sub_category: 'package_delivered', patterns: [/(package|shipment|order).*deliver/i] },
  { category: 'PACKAGE', sub_category: 'overture', patterns: [/overture/i], senders: [/overturepromo\.com/i, /ship2/i] },

  // --- PAYMENT ---
  { category: 'PAYMENT', sub_category: 'payment_processed', patterns: [/payment.*(processed|sent|complete|confirm)/i] },
  { category: 'PAYMENT', sub_category: 'tax_document', patterns: [/tax (form|document|1099)/i, /1099/i, /tax.*ready/i] },
  { category: 'PAYMENT', sub_category: 'payout', patterns: [/payout/i, /fast pay/i, /instant (pay|transfer)/i, /dasher.*pay/i] },

  // --- PROMOTION ---
  { category: 'PROMOTION', sub_category: 'peak_pay', patterns: [/peak pay/i, /extra.*pay/i, /bonus.*pay/i] },
  { category: 'PROMOTION', sub_category: 'incentive', patterns: [/incentive/i, /challenge/i, /earn.*extra/i, /guaranteed.*earnings/i] },
  { category: 'PROMOTION', sub_category: 'referral', patterns: [/referr?al/i, /refer a friend/i, /invite.*dash/i] },
  { category: 'PROMOTION', sub_category: 'offer', patterns: [/special offer/i, /exclusive.*offer/i, /limited.*time/i, /% off/i, /40% off/i, /here'?s \d+% off/i] },

  // --- SYSTEM ---
  { category: 'SYSTEM', sub_category: 'password_reset', patterns: [/password.*reset/i, /reset.*password/i, /forgot.*password/i] },
  { category: 'SYSTEM', sub_category: 'security_alert', patterns: [/security alert/i, /suspicious.*activity/i, /new (login|device|sign)/i] },
  { category: 'SYSTEM', sub_category: 'account_update', patterns: [/account.*(update|change|setting)/i] },
  { category: 'SYSTEM', sub_category: 'terms_update', patterns: [/terms of service/i, /privacy policy/i, /updated terms/i, /policy update/i] },
  { category: 'SYSTEM', sub_category: 'notification_pref', patterns: [/notification.*preference/i, /email.*preference/i, /unsubscribe/i] },
];

// State priority for determining current account state
const STATE_PRIORITY: Record<string, number> = {
  'DEACTIVATED': 100,
  'APPEALING': 95,
  'WARNING': 80,
  'ACTIVE': 70,
  'ONBOARDING': 60,
  'BGC_CLEAR': 50,
  'BGC_ISSUE': 45,
  'BGC_PENDING': 40,
  'VERIFYING': 30,
  'REGISTERED': 20,
  'UNKNOWN': 0,
};

const LIFECYCLE_SCORES: Record<string, number> = {
  'UNKNOWN': 0,
  'REGISTERED': 10,
  'VERIFYING': 20,
  'BGC_PENDING': 35,
  'BGC_ISSUE': 30,
  'BGC_CLEAR': 50,
  'ONBOARDING': 65,
  'ACTIVE': 85,
  'WARNING': 75,
  'DEACTIVATED': 5,
  'APPEALING': 15,
};

// Classify a single email using the pattern engine
function classifyEmail(subject: string, sender: string): {
  category: string;
  sub_category: string;
  confidence: number;
  extracted_data: Record<string, any>;
  pattern_matched: string;
} {
  const subjectLower = (subject || '').toLowerCase();
  const senderLower = (sender || '').toLowerCase();

  for (const rule of PATTERN_ENGINE) {
    // Check sender patterns first (if defined)
    if (rule.senders) {
      const senderMatch = rule.senders.some(sp => sp.test(senderLower));
      if (senderMatch) {
        const extracted: Record<string, any> = {};
        if (rule.extract) {
          const match = subject.match(rule.extract);
          if (match) extracted.value = match[1];
        }
        return {
          category: rule.category,
          sub_category: rule.sub_category,
          confidence: 0.9,
          extracted_data: extracted,
          pattern_matched: `sender:${rule.senders[0].source}`,
        };
      }
    }

    // Check subject patterns
    for (const pattern of rule.patterns) {
      if (pattern.test(subjectLower)) {
        const extracted: Record<string, any> = {};
        if (rule.extract) {
          const match = subject.match(rule.extract);
          if (match) extracted.value = match[1];
        }
        return {
          category: rule.category,
          sub_category: rule.sub_category,
          confidence: 1.0,
          extracted_data: extracted,
          pattern_matched: pattern.source,
        };
      }
    }
  }

  return {
    category: 'OTHER',
    sub_category: 'unclassified',
    confidence: 0,
    extracted_data: {},
    pattern_matched: '',
  };
}

// State machine: compute account state from classified emails
function computeAccountState(classifications: Array<{ category: string; sub_category: string; received_at: string }>): {
  current_state: string;
  previous_state: string | null;
  state_confidence: number;
  lifecycle_score: number;
  anomaly_flags: string[];
} {
  if (classifications.length === 0) {
    return { current_state: 'UNKNOWN', previous_state: null, state_confidence: 0, lifecycle_score: 0, anomaly_flags: [] };
  }

  // Sort chronologically
  const sorted = [...classifications].sort((a, b) =>
    new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  // Walk through email history and track state transitions
  const stateHistory: string[] = [];
  const anomalies: string[] = [];
  let lastState = 'UNKNOWN';

  // Category-to-state mapping
  const categoryToState: Record<string, string> = {
    'REGISTRATION': 'REGISTERED',
    'VERIFICATION': 'VERIFYING',
    'BGC': 'BGC_PENDING', // refined below
    'ONBOARDING': 'ONBOARDING',
    'ACTIVE': 'ACTIVE',
    'WARNING': 'WARNING',
    'DEACTIVATION': 'DEACTIVATED',
    'APPEAL': 'APPEALING',
  };

  // BGC sub-categories need special handling
  const bgcSubToState: Record<string, string> = {
    'bgc_started': 'BGC_PENDING',
    'bgc_processing': 'BGC_PENDING',
    'bgc_clear': 'BGC_CLEAR',
    'bgc_issue': 'BGC_ISSUE',
    'checkr': 'BGC_PENDING',
  };

  // Track what we've seen for anomaly detection
  const seenCategories = new Set<string>();
  const categoryDates: Record<string, Date[]> = {};

  for (const email of sorted) {
    seenCategories.add(email.category);
    if (!categoryDates[email.category]) categoryDates[email.category] = [];
    categoryDates[email.category].push(new Date(email.received_at));

    let newState = categoryToState[email.category];
    if (!newState) continue; // PACKAGE, PAYMENT, PROMOTION, SYSTEM, OTHER don't change state

    // Refine BGC state
    if (email.category === 'BGC') {
      newState = bgcSubToState[email.sub_category] || 'BGC_PENDING';
    }

    // Active sub-category: first_dash confirms ACTIVE
    if (email.category === 'ACTIVE' && email.sub_category === 'first_dash') {
      newState = 'ACTIVE';
    }

    // Only transition if it makes sense
    const newPriority = STATE_PRIORITY[newState] || 0;
    const lastPriority = STATE_PRIORITY[lastState] || 0;

    // Anomaly: regression without deactivation
    if (newPriority < lastPriority && newState !== 'DEACTIVATED' && lastState !== 'DEACTIVATED') {
      // Some regressions are normal (ACTIVE → WARNING → ACTIVE)
      if (!(lastState === 'WARNING' && newState === 'ACTIVE') &&
          !(lastState === 'ACTIVE' && newState === 'WARNING')) {
        // Skip: promotion/system emails that don't reflect state
        if (email.category !== 'PACKAGE' && email.category !== 'PAYMENT' &&
            email.category !== 'PROMOTION' && email.category !== 'SYSTEM') {
          anomalies.push(`Beklenmeyen geçiş: ${lastState} → ${newState}`);
        }
      }
    }

    // Deactivation always wins
    if (newState === 'DEACTIVATED') {
      stateHistory.push(lastState);
      lastState = 'DEACTIVATED';
      continue;
    }

    // Appeal only valid after deactivation
    if (newState === 'APPEALING') {
      if (lastState === 'DEACTIVATED') {
        stateHistory.push(lastState);
        lastState = 'APPEALING';
      }
      continue;
    }

    // For other states, only upgrade or specific transitions
    if (newPriority > lastPriority || lastState === 'UNKNOWN' ||
        (lastState === 'WARNING' && newState === 'ACTIVE')) {
      stateHistory.push(lastState);
      lastState = newState;
    }
  }

  // Anomaly: expected emails missing
  if (seenCategories.has('ACTIVE') && !seenCategories.has('BGC')) {
    anomalies.push('BGC emaili olmadan ACTIVE durumuna geçmiş');
  }

  // Calculate confidence: more emails in current state category = higher confidence
  const currentStateCategoryMap: Record<string, string[]> = {
    'ACTIVE': ['ACTIVE'],
    'DEACTIVATED': ['DEACTIVATION'],
    'WARNING': ['WARNING'],
    'BGC_CLEAR': ['BGC'],
    'BGC_PENDING': ['BGC'],
    'ONBOARDING': ['ONBOARDING'],
    'REGISTERED': ['REGISTRATION'],
    'VERIFYING': ['VERIFICATION'],
    'APPEALING': ['APPEAL'],
  };

  const relevantCategories = currentStateCategoryMap[lastState] || [];
  const relevantCount = relevantCategories.reduce(
    (sum, cat) => sum + (categoryDates[cat]?.length || 0), 0
  );
  const confidence = Math.min(1, 0.5 + (relevantCount * 0.1));

  const previousState = stateHistory.length > 0 ? stateHistory[stateHistory.length - 1] : null;

  return {
    current_state: lastState,
    previous_state: previousState,
    state_confidence: Number(confidence.toFixed(2)),
    lifecycle_score: LIFECYCLE_SCORES[lastState] || 0,
    anomaly_flags: anomalies,
  };
}

// Instinct Engine: analyze account data and generate insights
function generateInsights(
  accountEmail: string,
  state: string,
  classifications: Array<{ category: string; sub_category: string; received_at: string }>,
  anomalyFlags: string[],
  allAccountStates: Map<string, { state: string; bgcDate?: Date; deactDate?: Date; firstEmailDate?: Date; lastEmailDate?: Date }>
): Array<{
  insight_type: string;
  priority: string;
  title: string;
  description: string;
  suggested_action: string | null;
}> {
  const insights: Array<{
    insight_type: string;
    priority: string;
    title: string;
    description: string;
    suggested_action: string | null;
  }> = [];

  if (classifications.length === 0) return insights;

  const sorted = [...classifications].sort((a, b) =>
    new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  const now = new Date();
  const firstEmail = new Date(sorted[0].received_at);
  const lastEmail = new Date(sorted[sorted.length - 1].received_at);
  const daysSinceFirst = (now.getTime() - firstEmail.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceLast = (now.getTime() - lastEmail.getTime()) / (1000 * 60 * 60 * 24);

  // Find key dates
  const bgcClearDate = sorted.find(c => c.category === 'BGC' && c.sub_category === 'bgc_clear');
  const deactDate = sorted.find(c => c.category === 'DEACTIVATION');
  const firstActiveDate = sorted.find(c => c.category === 'ACTIVE');
  const warningDates = sorted.filter(c => c.category === 'WARNING');
  const packageDate = sorted.find(c => c.category === 'PACKAGE');

  // --- INSTINCT 1: Stale BGC ---
  if (state === 'BGC_PENDING') {
    const bgcStarted = sorted.find(c => c.category === 'BGC');
    if (bgcStarted) {
      const daysPending = (now.getTime() - new Date(bgcStarted.received_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysPending > 14) {
        insights.push({
          insight_type: 'risk',
          priority: 'urgent',
          title: 'BGC Çok Uzun Süredir Bekliyor',
          description: `BGC ${Math.round(daysPending)} gündür bekliyor. Normal süre 3-7 gün. Sorun olabilir.`,
          suggested_action: 'Checkr ile iletişime geçin veya hesabı manuel kontrol edin',
        });
      } else if (daysPending > 7) {
        insights.push({
          insight_type: 'risk',
          priority: 'warning',
          title: 'BGC Bekliyor',
          description: `BGC ${Math.round(daysPending)} gündür bekliyor. Normal süre 3-7 gün.`,
          suggested_action: 'Birkaç gün daha bekleyin, devam ederse kontrol edin',
        });
      }
    }
  }

  // --- INSTINCT 2: Missing First Package ---
  if (state === 'BGC_CLEAR' || state === 'ONBOARDING') {
    if (bgcClearDate && !packageDate) {
      const daysSinceBgc = (now.getTime() - new Date(bgcClearDate.received_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceBgc > 14) {
        insights.push({
          insight_type: 'anomaly',
          priority: 'warning',
          title: 'İlk Paket Eksik',
          description: `BGC ${Math.round(daysSinceBgc)} gün önce tamamlandı ama ilk paket hala gelmedi.`,
          suggested_action: 'Hesapta aktifleştirme sorunları olabilir, kontrol edin',
        });
      }
    }
  }

  // --- INSTINCT 3: Rapid Deactivation ---
  if (state === 'DEACTIVATED' && firstActiveDate && deactDate) {
    const activeDays = (new Date(deactDate.received_at).getTime() - new Date(firstActiveDate.received_at).getTime()) / (1000 * 60 * 60 * 24);
    if (activeDays < 7) {
      insights.push({
        insight_type: 'anomaly',
        priority: 'urgent',
        title: 'Çok Hızlı Deaktivasyon',
        description: `Hesap sadece ${Math.round(activeDays)} gün aktif kaldıktan sonra deaktive edildi. Bu çok kısa bir süre.`,
        suggested_action: 'Deaktivasyon nedenini araştırın, itiraz değerlendirin',
      });
    }
  }

  // --- INSTINCT 4: Warning Escalation ---
  if (warningDates.length >= 2) {
    const recentWarnings = warningDates.filter(w =>
      (now.getTime() - new Date(w.received_at).getTime()) / (1000 * 60 * 60 * 24) < 30
    );
    if (recentWarnings.length >= 2) {
      insights.push({
        insight_type: 'prediction',
        priority: 'urgent',
        title: 'Deaktivasyon Riski Yüksek',
        description: `Son 30 günde ${recentWarnings.length} uyarı aldı. Deaktivasyon riski çok yüksek.`,
        suggested_action: 'Hesap sahibini uyarın, uyarı nedenlerini inceleyin',
      });
    } else if (warningDates.length >= 2) {
      insights.push({
        insight_type: 'prediction',
        priority: 'warning',
        title: 'Çoklu Uyarı Geçmişi',
        description: `Toplamda ${warningDates.length} uyarı almış. Dikkatli izlenmeli.`,
        suggested_action: null,
      });
    }
  }

  // --- INSTINCT 5: Dormant Account ---
  if (state === 'ACTIVE' && daysSinceLast > 21) {
    insights.push({
      insight_type: 'anomaly',
      priority: 'warning',
      title: 'Hesap Uykuda',
      description: `Aktif durumdaki hesaptan ${Math.round(daysSinceLast)} gündür email gelmiyor. Hesap uykuda olabilir.`,
      suggested_action: null,
    });
  } else if (state === 'ACTIVE' && daysSinceLast > 14) {
    insights.push({
      insight_type: 'anomaly',
      priority: 'info',
      title: 'Email Aktivitesi Düşük',
      description: `Son ${Math.round(daysSinceLast)} gündür email gelmiyor.`,
      suggested_action: null,
    });
  }

  // --- INSTINCT 6: BGC to Active Without Onboarding ---
  if ((state === 'ACTIVE' || state === 'WARNING' || state === 'DEACTIVATED') &&
      bgcClearDate && firstActiveDate && !sorted.some(c => c.category === 'ONBOARDING')) {
    const bgcToActive = (new Date(firstActiveDate.received_at).getTime() - new Date(bgcClearDate.received_at).getTime()) / (1000 * 60 * 60 * 24);
    if (bgcToActive < 1) {
      insights.push({
        insight_type: 'anomaly',
        priority: 'info',
        title: 'Onboarding Atlandı',
        description: `BGC\'den aktivasyona ${Math.round(bgcToActive * 24)} saat içinde geçiş — onboarding emaili hiç gelmemiş.`,
        suggested_action: null,
      });
    }
  }

  // --- INSTINCT 7: Deactivation Pattern (cross-account) ---
  if (state !== 'DEACTIVATED') {
    let totalActive = 0;
    let totalDeactivated = 0;
    for (const [, acctData] of allAccountStates) {
      if (acctData.state === 'ACTIVE' || acctData.state === 'WARNING') totalActive++;
      if (acctData.state === 'DEACTIVATED') totalDeactivated++;
    }
    const deactRate = totalDeactivated / Math.max(1, totalActive + totalDeactivated);

    // Compare this account to cohort
    if (bgcClearDate && deactRate > 0.3) {
      const avgDeactDays: number[] = [];
      for (const [, acctData] of allAccountStates) {
        if (acctData.bgcDate && acctData.deactDate) {
          avgDeactDays.push((acctData.deactDate.getTime() - acctData.bgcDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      if (avgDeactDays.length > 0) {
        const avg = avgDeactDays.reduce((a, b) => a + b, 0) / avgDeactDays.length;
        const daysSinceBgc = (now.getTime() - new Date(bgcClearDate.received_at).getTime()) / (1000 * 60 * 60 * 24);
        const ratio = daysSinceBgc / avg;
        if (ratio > 0.8 && ratio <= 1.2) {
          insights.push({
            insight_type: 'prediction',
            priority: 'warning',
            title: 'Deaktivasyon Zaman Penceresi',
            description: `Bu hesap ortalama deaktivasyon süresine (${Math.round(avg)} gün) yaklaşıyor. Şu an: ${Math.round(daysSinceBgc)} gün.`,
            suggested_action: 'Hesabı yakından izleyin',
          });
        }
      }
    }
  }

  // --- INSTINCT 8: Anomaly flags from state machine ---
  for (const anomaly of anomalyFlags) {
    insights.push({
      insight_type: 'anomaly',
      priority: 'info',
      title: 'Anormal Geçiş',
      description: anomaly,
      suggested_action: null,
    });
  }

  // --- INSTINCT 9: Healthy Progress ---
  if (insights.length === 0 && state === 'ACTIVE') {
    insights.push({
      insight_type: 'action',
      priority: 'info',
      title: 'Sağlıklı İlerleme',
      description: `Hesap normal yaşam döngüsünde ilerliyor. ${classifications.length} email, ${Math.round(daysSinceFirst)} gündür aktif.`,
      suggested_action: null,
    });
  }

  return insights;
}

// --- AI Helper Functions ---

async function classifyEmailWithAI(subject: string, bodyText: string): Promise<{ email_type: string; confidence: number }> {
  const apiKey = Deno.env.get('SYNTHETIC_API_KEY');
  const apiUrl = Deno.env.get('SYNTHETIC_API_URL') || 'https://api.openai.com/v1';

  if (!apiKey) return { email_type: 'none', confidence: 0 };

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You classify DoorDash/Dasher emails. Return JSON only. Types: bgc_complete, deactivated, first_package, none. Fields: email_type, confidence (0-1).'
          },
          {
            role: 'user',
            content: `Subject: ${subject}\n\nBody: ${(bodyText || '').slice(0, 1000)}`
          }
        ],
        temperature: 0,
        max_tokens: 100
      })
    });

    if (!response.ok) return { email_type: 'none', confidence: 0 };

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    return { email_type: parsed.email_type || 'none', confidence: parsed.confidence || 0 };
  } catch (e) {
    console.error('[AI] Classification error:', e);
    return { email_type: 'none', confidence: 0 };
  }
}

async function extractEmailData(subject: string, bodyText: string, emailType: string): Promise<Record<string, any>> {
  const apiKey = Deno.env.get('SYNTHETIC_API_KEY');
  const apiUrl = Deno.env.get('SYNTHETIC_API_URL') || 'https://api.openai.com/v1';

  if (!apiKey) return {};

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'Extract structured data from DoorDash/Dasher email. Return JSON with fields: check_result, activation_date, dasher_region, reference_number, deactivation_reason, raw_summary. Use null for unavailable fields.'
          },
          {
            role: 'user',
            content: `Type: ${emailType}\nSubject: ${subject}\n\nBody: ${(bodyText || '').slice(0, 2000)}`
          }
        ],
        temperature: 0,
        max_tokens: 300
      })
    });

    if (!response.ok) return {};

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } catch (e) {
    console.error('[AI] Extraction error:', e);
    return {};
  }
}

async function fetchEmailBody(accountId: string, mailboxId: string, messageId: string, headers: Record<string, string>): Promise<string> {
  try {
    const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${messageId}`, { headers });
    if (!response.ok) return '';

    const data = await response.json();
    // SMTP.dev returns text and/or html body
    return data.text || data.html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  } catch (e) {
    console.error('[FETCH_BODY] Error:', e);
    return '';
  }
}

async function createNotifications(
  supabaseClient: any,
  type: string,
  title: string,
  message: string,
  metadata: Record<string, any> = {}
) {
  try {
    // Get all users with BGC permission (admins + users with can_view_bgc_complete)
    const { data: adminRoles } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const { data: bgcRoles } = await supabaseClient
      .from('user_roles')
      .select('user_id, role_permissions!inner(can_view_bgc_complete)')
      .not('custom_role_id', 'is', null);

    const userIds = new Set<string>();
    (adminRoles || []).forEach((r: any) => userIds.add(r.user_id));
    (bgcRoles || []).forEach((r: any) => {
      if (r.role_permissions?.can_view_bgc_complete) userIds.add(r.user_id);
    });

    if (userIds.size === 0) return;

    const notifications = Array.from(userIds).map(userId => ({
      user_id: userId,
      type,
      title,
      message,
      metadata
    }));

    const { error } = await supabaseClient.from('notifications').insert(notifications);
    if (error) console.error('[NOTIFY] Insert error:', error);
    else console.log(`[NOTIFY] Created ${notifications.length} notifications of type ${type}`);
  } catch (e) {
    console.error('[NOTIFY] Error:', e);
  }
}

// Helper: Scan a single account for BGC Complete and Deactivation patterns
async function scanSingleAccountBgc(
  account: any,
  headers: Record<string, string>,
  statusMap: Map<string, any>,
  existingBgcIds: Set<string>,
  bgcAccountIds: Set<string>,
  bgcAccountEmails: Set<string>,
  shouldScanDeactivation: boolean,
  existingDeactivatedIds: Set<string>,
  alreadyDeactivatedEmails: Set<string>,
  PATTERNS: { bgc_complete: string[]; deactivated: string },
  SCAN_FOLDERS: string[]
): Promise<{ bgcEmails: any[]; deactivatedEmails: any[]; messagesScanned: number; scannedMailboxes: number; skippedMessages: number }> {
  const bgcEmails: any[] = [];
  const deactivatedEmails: any[] = [];
  let messagesScanned = 0;
  let scannedMailboxes = 0;
  let skippedMessages = 0;
  
  try {
    const lastScan = statusMap.get(account.id);
    const cutoffDate = lastScan?.last_scanned_at ? new Date(lastScan.last_scanned_at) : null;
    
    // Get mailboxes for this account
    const mbRes = await fetch(`${SMTP_API_URL}/accounts/${account.id}/mailboxes`, { headers });
    if (!mbRes.ok) {
      console.error(`[BGC] Failed to fetch mailboxes for account ${account.id}`);
      return { bgcEmails, deactivatedEmails, messagesScanned, scannedMailboxes, skippedMessages };
    }
    
    const mbData = await mbRes.json();
    const mailboxes = (mbData.member || []).filter((mb: any) => 
      SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
    );
    
    // Scan mailboxes in parallel
    const mailboxResults = await Promise.all(
      mailboxes.map(async (mailbox: any) => {
        const mbBgcEmails: any[] = [];
        const mbDeactivatedEmails: any[] = [];
        let mbMessagesScanned = 0;
        let mbSkippedMessages = 0;
        let reachedOldMessagesForBgc = false;
        
        let msgPage = 1;
        let hasMoreMsgs = true;
        
        while (hasMoreMsgs) {
          const msgUrl = `${SMTP_API_URL}/accounts/${account.id}/mailboxes/${mailbox.id}/messages?page=${msgPage}`;
          
          const msgRes = await fetch(msgUrl, { headers });
          if (!msgRes.ok) break;
          
          const msgData = await msgRes.json();
          const messages = msgData.member || [];
          mbMessagesScanned += messages.length;
          
          for (const msg of messages) {
            const msgDate = new Date(msg.createdAt || msg.date || msg.receivedAt);
            const subject = (msg.subject || '').toLowerCase();
            const uniqueKey = `${account.id}_${mailbox.id}_${msg.id}`;
            
            const fromData = msg.from || {};
            const baseEmailData = {
              account_id: account.id,
              account_email: account.address,
              mailbox_id: mailbox.id,
              mailbox_path: mailbox.path,
              message_id: msg.id,
              subject: msg.subject,
              from_address: typeof fromData === 'string' ? fromData : fromData.address,
              from_name: typeof fromData === 'string' ? null : fromData.name,
              email_date: msg.createdAt || msg.date || msg.receivedAt
            };
            
            // BGC Complete scan (incremental - respects cutoff date)
            const isBgcComplete = PATTERNS.bgc_complete.some(p => subject.includes(p));
            if (isBgcComplete) {
              if (cutoffDate && msgDate <= cutoffDate) {
                mbSkippedMessages++;
                reachedOldMessagesForBgc = true;
              } else if (!existingBgcIds.has(uniqueKey)) {
                mbBgcEmails.push({ ...baseEmailData, email_type: 'bgc_complete' });
              }
            }
            
            // Deactivation scan (only for BGC accounts, no cutoff)
            const isDeactivated = subject.includes(PATTERNS.deactivated);
            if (isDeactivated && shouldScanDeactivation && !existingDeactivatedIds.has(uniqueKey)) {
              mbDeactivatedEmails.push({ ...baseEmailData, email_type: 'deactivated' });
            }
          }
          
          // Pagination logic
          if (msgData.view?.next) {
            if (shouldScanDeactivation || !reachedOldMessagesForBgc) {
              msgPage++;
            } else {
              hasMoreMsgs = false;
            }
          } else {
            hasMoreMsgs = false;
          }
        }
        
        return { 
          bgcEmails: mbBgcEmails, 
          deactivatedEmails: mbDeactivatedEmails, 
          messagesScanned: mbMessagesScanned,
          skippedMessages: mbSkippedMessages
        };
      })
    );
    
    // Aggregate mailbox results
    for (const mbResult of mailboxResults) {
      bgcEmails.push(...mbResult.bgcEmails);
      deactivatedEmails.push(...mbResult.deactivatedEmails);
      messagesScanned += mbResult.messagesScanned;
      skippedMessages += mbResult.skippedMessages;
    }
    scannedMailboxes = mailboxes.length;
    
  } catch (e) {
    console.error(`[BGC] Error processing account ${account.id}:`, e);
  }
  
  return { bgcEmails, deactivatedEmails, messagesScanned, scannedMailboxes, skippedMessages };
}

// --- FIRST PACKAGE DETECTION ENGINE ---
// "İlk paket atıldı" diye direkt mail gelmez.
// Ama bu mailler geldiyse, hesap KESİNLİKLE paket atmıştır:

const FIRST_PACKAGE_SUBJECT_PATTERNS: RegExp[] = [
  // Direkt ilk teslimat teyidi
  /first dash/i,
  /first (delivery|order)/i,

  // Welcome gift (ilk teslimatlardan sonra gönderilir)
  /welcome gift/i,
  /dasher welcome/i,
  /congratulations.*dasher/i,
  /hey,?\s*you made it/i,

  // Kazanç mailleri (kazanç = teslimat yapmış)
  /you earned \$/i,
  /you('ve| have) earned/i,
  /(weekly|daily|monthly)\s*(earnings?|pay|summary)/i,
  /earnings?\s*(summary|report|update)/i,

  // Ödeme mailleri (ödeme = teslimat yapmış)
  /your pay (is|has been)/i,
  /pay.*(deposited|sent|on the way)/i,
  /direct deposit/i,
  /deposit.*(processed|complete)/i,
  /payout/i,
  /fast pay/i,
  /instant (pay|transfer)/i,
  /dasher\s*pay/i,

  // Aktivite kanıtı (bunlar sadece aktif dasher'lara gider)
  /top dasher/i,
  /contract violation/i,
  /extremely late/i,
  /customer rat(ed|ing)/i,
  /your (dasher )?rating/i,
  /delivery.*(late|missing|issue)/i,

  // Vergi belgesi (vergi = gelir = teslimat)
  /1099/i,
  /tax (form|document|statement)/i,

  // Aktif dasher promosyonları
  /\$\d+.*bonus/i,
  /guaranteed.*earnings/i,
  /peak pay/i,
  /here'?s \d+% off/i,
  /earn.*(extra|more|bonus)/i,
  /challenge.*\$/i,
];

// Sender domain patterns (bu domain'lerden mail = paket atmış)
const FIRST_PACKAGE_SENDER_PATTERNS: RegExp[] = [
  /overturepromo\.com/i,
  /ship2/i,
];

// Check if a message indicates the account has delivered
function isFirstPackageSignal(subject: string, senderAddress: string): boolean {
  const subjectLower = (subject || '').toLowerCase();
  const senderLower = (senderAddress || '').toLowerCase();

  // Check sender first (overture/ship2 = welcome gift = delivered)
  for (const pattern of FIRST_PACKAGE_SENDER_PATTERNS) {
    if (pattern.test(senderLower)) return true;
  }

  // Check subject patterns
  for (const pattern of FIRST_PACKAGE_SUBJECT_PATTERNS) {
    if (pattern.test(subjectLower)) return true;
  }

  return false;
}

// Helper: Scan a single account for First Package signals
async function scanSingleAccountFirstPackage(
  accountId: string,
  accountEmail: string,
  headers: Record<string, string>,
  existingFirstPackageIds: Set<string>,
  _patterns: any, // kept for signature compatibility
  SCAN_FOLDERS: string[],
  cutoffDate: Date | null = null
): Promise<{ firstPackageEmails: any[]; messagesScanned: number }> {
  const firstPackageEmails: any[] = [];
  let messagesScanned = 0;

  try {
    const mbRes = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
    if (!mbRes.ok) {
      console.error(`[FIRST_PACKAGE] Failed to fetch mailboxes for account ${accountId}`);
      return { firstPackageEmails, messagesScanned };
    }

    const mbData = await mbRes.json();
    const mailboxes = (mbData.member || []).filter((mb: any) =>
      SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
    );

    let foundFirstPackage = false;

    // Scan mailboxes sequentially for early exit
    for (const mailbox of mailboxes) {
      if (foundFirstPackage) break;

      let msgPage = 1;
      let hasMoreMsgs = true;

      while (hasMoreMsgs && !foundFirstPackage) {
        const msgUrl = `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages?page=${msgPage}`;

        const msgRes = await fetch(msgUrl, { headers });
        if (!msgRes.ok) break;

        const msgData = await msgRes.json();
        const messages = msgData.member || [];
        messagesScanned += messages.length;

        for (const msg of messages) {
          const msgDate = new Date(msg.createdAt || msg.date || msg.receivedAt);

          // Skip messages older than cutoff (incremental scan)
          if (cutoffDate && msgDate <= cutoffDate) {
            continue;
          }

          const uniqueKey = `${accountId}_${mailbox.id}_${msg.id}`;
          const fromData = msg.from || {};
          const senderAddress = typeof fromData === 'string' ? fromData : (fromData.address || '');

          // Use the smart detection engine
          if (isFirstPackageSignal(msg.subject || '', senderAddress) && !existingFirstPackageIds.has(uniqueKey)) {
            firstPackageEmails.push({
              account_id: accountId,
              account_email: accountEmail,
              mailbox_id: mailbox.id,
              mailbox_path: mailbox.path,
              message_id: msg.id,
              subject: msg.subject,
              from_address: senderAddress,
              from_name: typeof fromData === 'string' ? null : fromData.name,
              email_date: msg.createdAt || msg.date || msg.receivedAt,
              email_type: 'first_package'
            });
            foundFirstPackage = true;
            console.log(`[FIRST_PACKAGE] DETECTED: "${msg.subject}" from=${senderAddress} account=${accountEmail}`);
            break;
          }
        }

        if (msgData.view?.next && !foundFirstPackage) {
          msgPage++;
        } else {
          hasMoreMsgs = false;
        }
      }
    }
  } catch (e) {
    console.error(`[FIRST_PACKAGE] Error processing account ${accountId}:`, e);
  }

  return { firstPackageEmails, messagesScanned };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SMTPDEV_API_KEY');
    if (!apiKey) {
      throw new Error('SMTP API key not configured');
    }

    // Parse body once and extract all needed values
    const body = await req.json();
    const { action, accountId, mailboxId, messageId, filters, page, email, password } = body;

    const headers = {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    };

    // Shared Supabase client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseClient = supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null;

    let result;

    switch (action) {
      case 'getAccounts': {
        // Add page parameter for pagination
        const url = page ? `${SMTP_API_URL}/accounts?page=${page}` : `${SMTP_API_URL}/accounts`;
        console.log('Fetching accounts from:', url);
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Accounts response:', JSON.stringify(data));
        
        // SMTP.dev returns { member: [...], totalItems, view } structure
        const accounts = data.member || data.data || [];
        
        result = { 
          accounts: accounts.map((acc: any) => ({
            id: acc.id,
            name: acc.address || acc.name,
            address: acc.address,
            mailboxes: (acc.mailboxes || []).map((mb: any) => ({
              id: mb.id,
              name: mb.path || mb.name,
              path: mb.path,
            })),
          })),
          totalItems: data.totalItems || accounts.length,
          view: data.view || null,
        };
        break;
      }

      case 'createAccount': {
        const defaultPassword = Deno.env.get('DEFAULT_ACCOUNT_PASSWORD') || 'ChangeMe!123';
        const createBody: any = {};
        if (email) createBody.address = email;
        createBody.password = password || defaultPassword;

        console.log('Creating account with:', JSON.stringify(createBody));
        const response = await fetch(`${SMTP_API_URL}/accounts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createBody),
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = await response.json();
        break;
      }

      case 'changePassword': {
        // Use already parsed body values
        if (!accountId) throw new Error('accountId required');
        if (!password) throw new Error('password required');

        console.log('Changing password for account:', accountId);
        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}`, {
          method: 'PATCH',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/merge-patch+json',
          },
          body: JSON.stringify({ password }),
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = await response.json();
        break;
      }

      case 'getMailboxes': {
        if (!accountId) throw new Error('accountId required');
        
        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        const mailboxes = data.member || data.data || [];
        result = { 
          mailboxes: mailboxes.map((mb: any) => ({
            id: mb.id,
            name: mb.path || mb.name,
            path: mb.path,
          }))
        };
        break;
      }

      case 'getMessages': {
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');
        
        // Add page parameter for pagination
        const url = page 
          ? `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages?page=${page}`
          : `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages`;
        console.log('Fetching messages from:', url);
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Messages response totalItems:', data.totalItems, 'view:', JSON.stringify(data.view));
        
        let messages = data.member || data.data || [];

        // Apply filters
        if (filters) {
          const now = new Date();

          if (filters.timeFilterMinutes) {
            const cutoff = new Date(now.getTime() - filters.timeFilterMinutes * 60000);
            messages = messages.filter((m: any) => {
              const msgDate = new Date(m.createdAt || m.date || m.receivedAt);
              return msgDate >= cutoff;
            });
          }

          if (filters.allowedSenders?.length) {
            messages = messages.filter((m: any) => {
              const fromAddr = m.from?.address || m.from || '';
              return filters.allowedSenders.some((s: string) => 
                s.startsWith('*@') 
                  ? fromAddr.endsWith(s.slice(1))
                  : fromAddr === s
              );
            });
          }

          if (filters.allowedReceivers?.length) {
            messages = messages.filter((m: any) => {
              const toList = Array.isArray(m.to) ? m.to : [m.to];
              const toAddrs = toList.map((t: any) => t?.address || t || '');
              return toAddrs.some((addr: string) => filters.allowedReceivers.includes(addr));
            });
          }

          // Subject filtering with wildcard support
          if (filters.allowedSubjects?.length) {
            messages = messages.filter((m: any) => {
              const subject = (m.subject || '').toLowerCase();
              return filters.allowedSubjects.some((pattern: string) => {
                const p = pattern.toLowerCase();
                // Wildcard support: *code* or Checkr:*
                if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
                  return subject.includes(p.slice(1, -1));
                } else if (p.startsWith('*')) {
                  return subject.endsWith(p.slice(1));
                } else if (p.endsWith('*')) {
                  return subject.startsWith(p.slice(0, -1));
                }
                return subject === p;
              });
            });
          }
        }

        const hasActiveFilters = filters && (
          filters.timeFilterMinutes ||
          filters.allowedSenders?.length ||
          filters.allowedReceivers?.length ||
          filters.allowedSubjects?.length
        );

        result = {
          messages,
          totalItems: hasActiveFilters ? messages.length : (data.totalItems || messages.length),
          view: hasActiveFilters ? null : (data.view || null),
        };
        break;
      }

      case 'getMessage': {
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');
        if (!messageId) throw new Error('messageId required');

        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${messageId}`, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = await response.json();
        break;
      }

      case 'getAttachment': {
        const { attachmentId } = body;
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');
        if (!messageId) throw new Error('messageId required');
        if (!attachmentId) throw new Error('attachmentId required');

        console.log('Fetching attachment:', attachmentId);
        const response = await fetch(
          `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${messageId}/attachments/${attachmentId}`,
          { headers }
        );
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        
        // Get the attachment data as arrayBuffer then convert to base64 (chunk-safe)
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let base64 = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          base64 += String.fromCharCode(...chunk);
        }
        base64 = btoa(base64);
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        result = { 
          data: base64, 
          contentType,
          filename: body.filename || 'attachment'
        };
        break;
      }

      case 'deleteAccount': {
        if (!accountId) throw new Error('accountId required');

        console.log('Deleting account:', accountId);
        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}`, {
          method: 'DELETE',
          headers,
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = { success: true, message: 'Account deleted' };
        break;
      }

      case 'deleteAllMessages': {
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');

        console.log('Deleting all messages from mailbox:', mailboxId);

        let deletedCount = 0;
        let totalMessages = 0;
        let hasMore = true;

        while (hasMore) {
          const listResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages`, { headers });
          if (!listResponse.ok) {
            throw new Error(`Failed to list messages: ${listResponse.status}`);
          }
          const listData = await listResponse.json();
          const messages = listData.member || listData.data || [];

          if (messages.length === 0) {
            hasMore = false;
            break;
          }

          totalMessages += messages.length;

          for (const msg of messages) {
            try {
              const delResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${msg.id}`, {
                method: 'DELETE',
                headers,
              });
              if (delResponse.ok) deletedCount++;
            } catch (e) {
              console.error('Failed to delete message:', msg.id, e);
            }
          }

          // If we deleted fewer than received, there might be an issue — stop to avoid infinite loop
          if (deletedCount < totalMessages) {
            hasMore = false;
          }
        }

        result = { success: true, deletedCount, totalMessages };
        break;
      }

      case 'deleteAllMailboxMessages': {
        // Delete messages from all mailboxes (inbox + trash)
        if (!accountId) throw new Error('accountId required');

        console.log('Deleting all messages from all mailboxes for account:', accountId);

        const mbResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
        if (!mbResponse.ok) {
          throw new Error(`Failed to list mailboxes: ${mbResponse.status}`);
        }
        const mbData = await mbResponse.json();
        const allMailboxes = mbData.member || mbData.data || [];

        let totalDeleted = 0;

        for (const mailbox of allMailboxes) {
          let hasMore = true;
          while (hasMore) {
            const listResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages`, { headers });
            if (!listResponse.ok) { hasMore = false; break; }

            const listData = await listResponse.json();
            const msgs = listData.member || listData.data || [];

            if (msgs.length === 0) { hasMore = false; break; }

            let batchDeleted = 0;
            for (const msg of msgs) {
              try {
                const delResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages/${msg.id}`, {
                  method: 'DELETE',
                  headers,
                });
                if (delResponse.ok) { totalDeleted++; batchDeleted++; }
              } catch (e) {
                console.error('Failed to delete message:', msg.id, e);
              }
            }

            // Stop if nothing was deleted to avoid infinite loop
            if (batchDeleted === 0) hasMore = false;
          }
        }

        result = { success: true, deletedCount: totalDeleted };
        break;
      }

      case 'scanBgcComplete': {
        if (!supabaseClient) throw new Error('Supabase not configured');

        // Email subject patterns to track
        const PATTERNS = {
          bgc_complete: ['your background check is complete'],
          deactivated: 'your dasher account has been deactivated',
        };
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newBgcEmails: any[] = [];
        const newDeactivatedEmails: any[] = [];
        let scannedMailboxes = 0;
        let messagesScanned = 0;
        let skippedMessages = 0;
        
        console.log('[BGC] Starting PARALLEL scan...');
        const startTime = Date.now();
        
        // 1. Get existing scan statuses from DB (for BGC incremental scan)
        const { data: scanStatuses } = await supabaseClient
          .from('bgc_scan_status')
          .select('*');
        
        const statusMap = new Map(
          (scanStatuses || []).map((s: any) => [s.account_id, s])
        );
        
        console.log(`[BGC] Found ${statusMap.size} previously scanned accounts`);
        
        // 2. Get existing BGC email IDs and accounts to avoid duplicates
        const { data: existingBgcEmails } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'bgc_complete');
        
        const existingBgcIds = new Set(
          (existingBgcEmails || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        // Set of accounts that have BGC complete (for deactivation scan)
        const bgcAccountIds = new Set(
          (existingBgcEmails || []).map((e: any) => e.account_id)
        );
        const bgcAccountEmails = new Set(
          (existingBgcEmails || []).map((e: any) => e.account_email)
        );
        
        console.log(`[BGC] ${existingBgcIds.size} BGC emails in database, ${bgcAccountIds.size} unique accounts`);
        
        // 3. Get already deactivated accounts (to skip them)
        const { data: existingDeactivated } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'deactivated');
        
        const alreadyDeactivatedEmails = new Set(
          (existingDeactivated || []).map((e: any) => e.account_email)
        );
        const existingDeactivatedIds = new Set(
          (existingDeactivated || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        console.log(`[BGC] ${alreadyDeactivatedEmails.size} accounts already marked as deactivated`);
        
        // 4. Fetch all accounts with pagination
        let allAccounts: any[] = [];
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          const accountsUrl = `${SMTP_API_URL}/accounts?page=${currentPage}`;
          console.log('[BGC] Fetching accounts page:', currentPage);
          
          const res = await fetch(accountsUrl, { headers });
          if (!res.ok) {
            const text = await res.text();
            console.error('[BGC] Failed to fetch accounts:', text);
            throw new Error(`Failed to fetch accounts: ${res.status}`);
          }
          
          const data = await res.json();
          const accounts = data.member || [];
          allAccounts = [...allAccounts, ...accounts];
          
          // Check pagination
          if (data.view?.last) {
            const pageMatch = data.view.last.match(/page=(\d+)/);
            const totalPages = pageMatch ? parseInt(pageMatch[1]) : currentPage;
            hasMorePages = currentPage < totalPages;
            currentPage++;
          } else {
            hasMorePages = false;
          }
        }
        
        console.log(`[BGC] Found ${allAccounts.length} accounts total`);
        
        // 5. Process accounts in parallel batches
        const batches: any[][] = [];
        for (let i = 0; i < allAccounts.length; i += ACCOUNT_BATCH_SIZE) {
          batches.push(allAccounts.slice(i, i + ACCOUNT_BATCH_SIZE));
        }
        
        console.log(`[BGC] Processing ${batches.length} batches of ${ACCOUNT_BATCH_SIZE} accounts each`);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`[BGC] Processing batch ${batchIndex + 1}/${batches.length}`);

          // Safety: stop if approaching timeout (50s limit)
          const MAX_EXECUTION_MS = 50000;
          if (Date.now() - startTime > MAX_EXECUTION_MS) {
            console.log(`[BGC] Approaching timeout at batch ${batchIndex + 1}, stopping early`);
            break;
          }

          // Save state before batch for re-scan of newly discovered BGC accounts
          const bgcAccountIdsBeforeBatch = new Set(bgcAccountIds);

          // Process batch in parallel
          const batchResults = await Promise.all(
            batch.map(account => {
              const shouldScanDeactivation = bgcAccountIds.has(account.id) && !alreadyDeactivatedEmails.has(account.address);
              
              return scanSingleAccountBgc(
                account,
                headers,
                statusMap,
                existingBgcIds,
                bgcAccountIds,
                bgcAccountEmails,
                shouldScanDeactivation,
                existingDeactivatedIds,
                alreadyDeactivatedEmails,
                PATTERNS,
                SCAN_FOLDERS
              );
            })
          );
          
          // Aggregate batch results
          for (const accountResult of batchResults) {
            newBgcEmails.push(...accountResult.bgcEmails);
            newDeactivatedEmails.push(...accountResult.deactivatedEmails);
            messagesScanned += accountResult.messagesScanned;
            scannedMailboxes += accountResult.scannedMailboxes;
            skippedMessages += accountResult.skippedMessages;
            
            // Add new BGC accounts to sets for deactivation tracking
            for (const bgcEmail of accountResult.bgcEmails) {
              existingBgcIds.add(`${bgcEmail.account_id}_${bgcEmail.mailbox_id}_${bgcEmail.message_id}`);
              bgcAccountIds.add(bgcEmail.account_id);
              bgcAccountEmails.add(bgcEmail.account_email);
            }
            
            // Add new deactivated accounts to set
            for (const deactEmail of accountResult.deactivatedEmails) {
              existingDeactivatedIds.add(`${deactEmail.account_id}_${deactEmail.mailbox_id}_${deactEmail.message_id}`);
              alreadyDeactivatedEmails.add(deactEmail.account_email);
            }
          }

          // Re-scan newly discovered BGC accounts for deactivation (they were missed in the initial batch)
          const newlyDiscoveredBgcInBatch = batchResults.flatMap(r => r.bgcEmails)
            .filter(e => !bgcAccountIdsBeforeBatch.has(e.account_id));

          if (newlyDiscoveredBgcInBatch.length > 0) {
            const newBgcAccountIds = new Set(newlyDiscoveredBgcInBatch.map(e => e.account_id));
            const accountsToRescan = batch.filter(a => newBgcAccountIds.has(a.id) && !alreadyDeactivatedEmails.has(a.address));

            if (accountsToRescan.length > 0) {
              console.log(`[BGC] Re-scanning ${accountsToRescan.length} newly discovered BGC accounts for deactivation`);
              const deactResults = await Promise.all(
                accountsToRescan.map(account =>
                  scanSingleAccountBgc(
                    account, headers, statusMap,
                    existingBgcIds, bgcAccountIds, bgcAccountEmails,
                    true, // force deactivation scan
                    existingDeactivatedIds, alreadyDeactivatedEmails,
                    PATTERNS, SCAN_FOLDERS
                  )
                )
              );
              for (const deactResult of deactResults) {
                newDeactivatedEmails.push(...deactResult.deactivatedEmails);
                for (const deactEmail of deactResult.deactivatedEmails) {
                  existingDeactivatedIds.add(`${deactEmail.account_id}_${deactEmail.mailbox_id}_${deactEmail.message_id}`);
                  alreadyDeactivatedEmails.add(deactEmail.account_email);
                }
              }
            }
          }

          // Update scan status for batch accounts
          const statusUpdates = batch.map(account => ({
            account_id: account.id,
            account_email: account.address,
            last_scanned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
          
          await supabaseClient.from('bgc_scan_status').upsert(statusUpdates, { onConflict: 'account_id' });
        }
        
        const elapsedMs = Date.now() - startTime;
        console.log(`[BGC] Parallel scan completed in ${elapsedMs}ms (${(elapsedMs/1000).toFixed(1)}s)`);
        
        // 6. Insert new emails to database (both BGC complete and deactivated)
        const allNewEmails = [...newBgcEmails, ...newDeactivatedEmails];

        if (allNewEmails.length > 0) {
          const { data: insertedEmails, error: insertError } = await supabaseClient
            .from('bgc_complete_emails')
            .upsert(allNewEmails, {
              onConflict: 'account_id,mailbox_id,message_id',
              ignoreDuplicates: true
            })
            .select('id, account_email, email_type, email_date');

          if (insertError) {
            console.error('[BGC] Error inserting emails:', insertError);
          } else {
            console.log(`[BGC] Inserted ${allNewEmails.length} new emails to database (${newBgcEmails.length} BGC, ${newDeactivatedEmails.length} deactivated)`);

            // Create account_events for new emails
            if (insertedEmails && insertedEmails.length > 0) {
              const events = insertedEmails.map((e: any) => ({
                account_email: e.account_email,
                event_type: e.email_type === 'bgc_complete' ? 'bgc_complete' : 'deactivated',
                event_date: e.email_date,
                source_email_id: e.id
              }));
              const { error: eventError } = await supabaseClient.from('account_events').insert(events);
              if (eventError) console.error('[BGC] Error inserting events:', eventError);
            }
          }

          // Send notifications
          if (newBgcEmails.length > 0) {
            const emails = [...new Set(newBgcEmails.map(e => e.account_email))];
            await createNotifications(
              supabaseClient,
              'new_bgc_complete',
              `${newBgcEmails.length} Yeni BGC Complete`,
              `Yeni BGC tamamlanan hesaplar: ${emails.slice(0, 3).map(e => e.split('@')[0]).join(', ')}${emails.length > 3 ? ` ve ${emails.length - 3} daha` : ''}`,
              { count: newBgcEmails.length, emails: emails.slice(0, 10) }
            );
          }

          if (newDeactivatedEmails.length > 0) {
            const emails = [...new Set(newDeactivatedEmails.map(e => e.account_email))];
            await createNotifications(
              supabaseClient,
              'new_deactivation',
              `${newDeactivatedEmails.length} Yeni Deaktivasyon`,
              `Deaktive edilen hesaplar: ${emails.slice(0, 3).map(e => e.split('@')[0]).join(', ')}${emails.length > 3 ? ` ve ${emails.length - 3} daha` : ''}`,
              { count: newDeactivatedEmails.length, emails: emails.slice(0, 10) }
            );
          }
        }
        
        // 7. Get counts from database
        const { count: totalBgcInDb } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'bgc_complete');

        const { count: totalDeactivatedInDb } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'deactivated');
        
        console.log(`[BGC] Scan complete. New BGC: ${newBgcEmails.length}, New Deactivated: ${newDeactivatedEmails.length}, Total BGC: ${totalBgcInDb}, Total Deactivated: ${totalDeactivatedInDb}`);
        
        result = {
          newBgcFound: newBgcEmails.length,
          newDeactivatedFound: newDeactivatedEmails.length,
          totalBgcInDb: totalBgcInDb || 0,
          totalDeactivatedInDb: totalDeactivatedInDb || 0,
          elapsedMs,
          accountsScanned: allAccounts.length,
          messagesScanned
        };
        break;
      }

      case 'scanFirstPackage': {
        if (!supabaseClient) throw new Error('Supabase not configured');

        // Patterns now handled by isFirstPackageSignal() engine
        const FIRST_PACKAGE_PATTERNS: string[] = []; // kept for compatibility, detection uses regex engine
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newFirstPackageEmails: any[] = [];
        let messagesScanned = 0;
        
        console.log('[FIRST_PACKAGE] Starting PARALLEL scan...');
        const startTime = Date.now();
        
        // 1. Get BGC complete accounts
        const { data: bgcAccounts } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_id, account_email')
          .eq('email_type', 'bgc_complete');
        
        const bgcAccountMap = new Map(
          (bgcAccounts || []).map((e: any) => [e.account_id, e.account_email])
        );
        
        console.log(`[FIRST_PACKAGE] ${bgcAccountMap.size} BGC accounts`);
        
        // 2. Get deactivated accounts (these are NOT clear)
        const { data: deactivatedAccounts } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_email')
          .eq('email_type', 'deactivated');
        
        const deactivatedEmails = new Set(
          (deactivatedAccounts || []).map((e: any) => e.account_email)
        );
        
        // 3. Get already first_package accounts
        const { data: existingFirstPackage } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'first_package');
        
        const alreadyFirstPackageEmails = new Set(
          (existingFirstPackage || []).map((e: any) => e.account_email)
        );
        const existingFirstPackageIds = new Set(
          (existingFirstPackage || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        console.log(`[FIRST_PACKAGE] ${deactivatedEmails.size} deactivated, ${alreadyFirstPackageEmails.size} already have first package`);

        // Get scan statuses for incremental scanning
        const { data: fpScanStatuses } = await supabaseClient
          .from('bgc_scan_status')
          .select('account_id, last_scanned_at');

        const fpStatusMap = new Map(
          (fpScanStatuses || []).map((s: any) => [s.account_id, s.last_scanned_at])
        );

        // 4. Build list of BGC complete accounts that don't have first_package yet
        // Include deactivated accounts too — they may have delivered before deactivation
        const clearAccounts: { id: string; email: string }[] = [];
        for (const [accountId, email] of bgcAccountMap.entries()) {
          if (!alreadyFirstPackageEmails.has(email)) {
            clearAccounts.push({ id: accountId, email });
          }
        }

        console.log(`[FIRST_PACKAGE] ${clearAccounts.length} accounts to scan (incl. deactivated)`);
        
        // 5. Process accounts in parallel batches
        const batches: { id: string; email: string }[][] = [];
        for (let i = 0; i < clearAccounts.length; i += ACCOUNT_BATCH_SIZE) {
          batches.push(clearAccounts.slice(i, i + ACCOUNT_BATCH_SIZE));
        }
        
        console.log(`[FIRST_PACKAGE] Processing ${batches.length} batches of ${ACCOUNT_BATCH_SIZE} accounts each`);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`[FIRST_PACKAGE] Processing batch ${batchIndex + 1}/${batches.length}`);

          // Safety: stop if approaching timeout (50s limit)
          const MAX_EXECUTION_MS = 50000;
          if (Date.now() - startTime > MAX_EXECUTION_MS) {
            console.log(`[FIRST_PACKAGE] Approaching timeout at batch ${batchIndex + 1}, stopping early`);
            break;
          }

          // Process batch in parallel
          // No cutoff date — scan ALL messages for first package signals
          // Accounts that already have first_package are already filtered out above
          const batchResults = await Promise.all(
            batch.map(account => {
              return scanSingleAccountFirstPackage(
                account.id,
                account.email,
                headers,
                existingFirstPackageIds,
                FIRST_PACKAGE_PATTERNS,
                SCAN_FOLDERS,
                null // scan all messages, no cutoff
              );
            })
          );
          
          // Aggregate batch results
          for (const accountResult of batchResults) {
            newFirstPackageEmails.push(...accountResult.firstPackageEmails);
            messagesScanned += accountResult.messagesScanned;
            
            // Add to set to avoid duplicates within this scan
            for (const fpEmail of accountResult.firstPackageEmails) {
              existingFirstPackageIds.add(`${fpEmail.account_id}_${fpEmail.mailbox_id}_${fpEmail.message_id}`);
              alreadyFirstPackageEmails.add(fpEmail.account_email);
            }
          }
        }
        
        const elapsedMs = Date.now() - startTime;
        console.log(`[FIRST_PACKAGE] Parallel scan completed in ${elapsedMs}ms (${(elapsedMs/1000).toFixed(1)}s)`);
        
        // 6. Insert new first package emails
        if (newFirstPackageEmails.length > 0) {
          const { error: insertError } = await supabaseClient
            .from('bgc_complete_emails')
            .upsert(newFirstPackageEmails, {
              onConflict: 'account_id,mailbox_id,message_id',
              ignoreDuplicates: true
            });
          
          if (insertError) {
            console.error('[FIRST_PACKAGE] Error inserting emails:', insertError);
          } else {
            console.log(`[FIRST_PACKAGE] Inserted ${newFirstPackageEmails.length} new first package emails`);
          }
        }
        
        // 7. Get total count
        const { count: totalFirstPackageInDb } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'first_package');
        
        console.log(`[FIRST_PACKAGE] Scan complete. New: ${newFirstPackageEmails.length}, Total: ${totalFirstPackageInDb}`);
        
        result = {
          newFirstPackageFound: newFirstPackageEmails.length,
          totalFirstPackageInDb: totalFirstPackageInDb || 0,
          scannedAccounts: clearAccounts.length,
          messagesScanned,
          elapsedMs
        };
        break;
      }

      case 'classifyAndExtract': {
        // On-demand AI classification + data extraction for a single email
        if (!supabaseClient) throw new Error('Supabase not configured');
        const { emailId } = body;
        if (!emailId) throw new Error('emailId required');

        // Fetch email record
        const { data: emailRecord, error: emailErr } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*')
          .eq('id', emailId)
          .single();

        if (emailErr || !emailRecord) throw new Error('Email not found');

        // Fetch email body from SMTP.dev
        const bodyText = await fetchEmailBody(
          emailRecord.account_id,
          emailRecord.mailbox_id,
          emailRecord.message_id,
          headers
        );

        // AI classification
        const classification = await classifyEmailWithAI(emailRecord.subject, bodyText);

        // AI extraction
        const extracted = await extractEmailData(
          emailRecord.subject,
          bodyText,
          classification.email_type !== 'none' ? classification.email_type : emailRecord.email_type
        );

        // Update the email record
        const { error: updateErr } = await supabaseClient
          .from('bgc_complete_emails')
          .update({
            ai_classified: true,
            ai_confidence: classification.confidence,
            extracted_data: extracted,
            email_body_fetched: bodyText.length > 0
          })
          .eq('id', emailId);

        if (updateErr) console.error('[AI] Update error:', updateErr);

        result = {
          classification,
          extracted_data: extracted,
          body_length: bodyText.length,
          success: !updateErr
        };
        break;
      }

      case 'calculateRiskScores': {
        if (!supabaseClient) throw new Error('Supabase not configured');

        // Get all BGC complete accounts
        const { data: bgcEmails } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_email, email_date, email_type')
          .order('email_date', { ascending: true });

        if (!bgcEmails || bgcEmails.length === 0) {
          result = { calculated: 0 };
          break;
        }

        // Build per-account data
        const accountData = new Map<string, { bgcDate?: Date; deactDate?: Date; firstPkgDate?: Date }>();
        for (const email of bgcEmails) {
          if (!accountData.has(email.account_email)) {
            accountData.set(email.account_email, {});
          }
          const acct = accountData.get(email.account_email)!;
          const date = new Date(email.email_date);
          if (email.email_type === 'bgc_complete' && (!acct.bgcDate || date < acct.bgcDate)) acct.bgcDate = date;
          if (email.email_type === 'deactivated' && (!acct.deactDate || date < acct.deactDate)) acct.deactDate = date;
          if (email.email_type === 'first_package' && (!acct.firstPkgDate || date < acct.firstPkgDate)) acct.firstPkgDate = date;
        }

        // Calculate average days-to-deactivation from historical data
        const deactDays: number[] = [];
        for (const [, data] of accountData) {
          if (data.bgcDate && data.deactDate) {
            deactDays.push((data.deactDate.getTime() - data.bgcDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
        const avgDeactDays = deactDays.length > 0 ? deactDays.reduce((a, b) => a + b, 0) / deactDays.length : 30;

        // Calculate risk for Clear accounts only
        const now = new Date();
        const riskScores: { account_email: string; risk_score: number; risk_factors: any[] }[] = [];

        for (const [email, data] of accountData) {
          if (data.deactDate) continue; // Already deactivated, skip
          if (!data.bgcDate) continue;

          const daysSinceBgc = (now.getTime() - data.bgcDate.getTime()) / (1000 * 60 * 60 * 24);
          const factors: string[] = [];
          let score = 0;

          // Time-based risk: how close to avg deactivation time
          const timeRatio = daysSinceBgc / avgDeactDays;
          if (timeRatio >= 1.0) {
            score += 40;
            factors.push(`BGC'den bu yana ${Math.round(daysSinceBgc)} gün (ortalama: ${Math.round(avgDeactDays)} gün)`);
          } else if (timeRatio >= 0.7) {
            score += 25;
            factors.push(`BGC'den bu yana ${Math.round(daysSinceBgc)} gün (ortalamanın %${Math.round(timeRatio * 100)}'i)`);
          } else if (timeRatio >= 0.4) {
            score += 10;
          }

          // Missing first package after 14+ days
          if (!data.firstPkgDate && daysSinceBgc >= 14) {
            score += 25;
            factors.push(`14+ gün olmasına rağmen ilk paket yok`);
          }

          // Very new account (< 3 days) - low risk
          if (daysSinceBgc < 3) {
            score = Math.max(0, score - 15);
          }

          riskScores.push({
            account_email: email,
            risk_score: Math.min(100, Math.max(0, score)),
            risk_factors: factors
          });
        }

        // Upsert risk scores
        if (riskScores.length > 0) {
          const upsertData = riskScores.map(rs => ({
            account_email: rs.account_email,
            risk_score: rs.risk_score,
            risk_factors: rs.risk_factors,
            last_calculated_at: new Date().toISOString()
          }));

          const { error: riskErr } = await supabaseClient
            .from('bgc_risk_scores')
            .upsert(upsertData, { onConflict: 'account_email' });

          if (riskErr) console.error('[RISK] Upsert error:', riskErr);
        }

        result = {
          calculated: riskScores.length,
          avgDeactivationDays: Math.round(avgDeactDays),
          highRisk: riskScores.filter(r => r.risk_score >= 50).length,
          mediumRisk: riskScores.filter(r => r.risk_score >= 25 && r.risk_score < 50).length,
          lowRisk: riskScores.filter(r => r.risk_score < 25).length
        };
        break;
      }

      case 'deepAnalyze': {
        // DASHER INTELLIGENCE ENGINE — Full account analysis
        if (!supabaseClient) throw new Error('Supabase not configured');

        const batchSize = body.batchSize || 10;
        const forceRefresh = body.forceRefresh || false;

        console.log('[INTELLIGENCE] Starting deep analysis...');
        const startTime = Date.now();

        // 1. Fetch all SMTP accounts with pagination
        let allAccounts: any[] = [];
        let currentPage = 1;
        let hasMorePages = true;

        while (hasMorePages) {
          const res = await fetch(`${SMTP_API_URL}/accounts?page=${currentPage}`, { headers });
          if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
          const data = await res.json();
          allAccounts = [...allAccounts, ...(data.member || [])];
          if (data.view?.last) {
            const pageMatch = data.view.last.match(/page=(\d+)/);
            const totalPages = pageMatch ? parseInt(pageMatch[1]) : currentPage;
            hasMorePages = currentPage < totalPages;
            currentPage++;
          } else {
            hasMorePages = false;
          }
        }

        console.log(`[INTELLIGENCE] ${allAccounts.length} accounts found`);

        // 2. Check which accounts need analysis
        const { data: existingStates } = await supabaseClient
          .from('account_states')
          .select('account_email, last_analyzed_at');

        const stateMap = new Map(
          (existingStates || []).map((s: any) => [s.account_email, s.last_analyzed_at])
        );

        // Find accounts to process: new ones or stale ones (analyzed > 1 hour ago)
        const staleThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
        let accountsToProcess = allAccounts;
        if (!forceRefresh) {
          accountsToProcess = allAccounts.filter(a => {
            const lastAnalyzed = stateMap.get(a.address);
            return !lastAnalyzed || new Date(lastAnalyzed) < staleThreshold;
          });
        }

        // Limit to batchSize
        const accountsBatch = accountsToProcess.slice(0, batchSize);
        console.log(`[INTELLIGENCE] Processing ${accountsBatch.length}/${accountsToProcess.length} accounts (${allAccounts.length} total)`);

        // 3. Get existing classifications to avoid re-processing
        const { data: existingClassifications } = await supabaseClient
          .from('email_classifications')
          .select('account_id, message_id');

        const classifiedSet = new Set(
          (existingClassifications || []).map((c: any) => `${c.account_id}_${c.message_id}`)
        );

        // 4. Process each account
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam', 'Sent'];
        let totalClassified = 0;
        let totalNewClassifications = 0;
        let statesUpdated = 0;
        let insightsGenerated = 0;

        // Collect all account states for cross-account analysis
        const allAccountStateData = new Map<string, {
          state: string;
          bgcDate?: Date;
          deactDate?: Date;
          firstEmailDate?: Date;
          lastEmailDate?: Date;
        }>();

        // Load existing states for cross-account analysis
        const { data: allStates } = await supabaseClient
          .from('account_states')
          .select('account_email, current_state, first_email_at, last_email_at, metadata');

        for (const s of (allStates || [])) {
          allAccountStateData.set(s.account_email, {
            state: s.current_state,
            bgcDate: s.metadata?.bgc_clear_date ? new Date(s.metadata.bgc_clear_date) : undefined,
            deactDate: s.metadata?.deact_date ? new Date(s.metadata.deact_date) : undefined,
            firstEmailDate: s.first_email_at ? new Date(s.first_email_at) : undefined,
            lastEmailDate: s.last_email_at ? new Date(s.last_email_at) : undefined,
          });
        }

        for (const account of accountsBatch) {
          // Safety: stop if approaching timeout
          if (Date.now() - startTime > 45000) {
            console.log(`[INTELLIGENCE] Approaching timeout, stopping`);
            break;
          }

          try {
            console.log(`[INTELLIGENCE] Analyzing ${account.address}...`);

            // Fetch mailboxes
            const mbRes = await fetch(`${SMTP_API_URL}/accounts/${account.id}/mailboxes`, { headers });
            if (!mbRes.ok) continue;
            const mbData = await mbRes.json();
            const mailboxes = (mbData.member || []).filter((mb: any) =>
              SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
            );

            // Fetch ALL messages from all mailboxes
            const allMessages: Array<{
              id: string;
              subject: string;
              sender: string;
              receivedAt: string;
              mailboxId: string;
            }> = [];

            for (const mailbox of mailboxes) {
              let msgPage = 1;
              let hasMoreMsgs = true;
              while (hasMoreMsgs) {
                const msgRes = await fetch(
                  `${SMTP_API_URL}/accounts/${account.id}/mailboxes/${mailbox.id}/messages?page=${msgPage}`,
                  { headers }
                );
                if (!msgRes.ok) break;
                const msgData = await msgRes.json();
                const messages = msgData.member || [];

                for (const msg of messages) {
                  const fromData = msg.from || {};
                  allMessages.push({
                    id: msg.id,
                    subject: msg.subject || '',
                    sender: typeof fromData === 'string' ? fromData : (fromData.address || ''),
                    receivedAt: msg.createdAt || msg.date || msg.receivedAt,
                    mailboxId: mailbox.id,
                  });
                }

                hasMoreMsgs = !!msgData.view?.next;
                msgPage++;
              }
            }

            console.log(`[INTELLIGENCE] ${account.address}: ${allMessages.length} messages`);
            totalClassified += allMessages.length;

            // Classify all messages
            const newClassifications: any[] = [];
            const allClassificationsForState: Array<{
              category: string;
              sub_category: string;
              received_at: string;
            }> = [];

            for (const msg of allMessages) {
              const result = classifyEmail(msg.subject, msg.sender);
              allClassificationsForState.push({
                category: result.category,
                sub_category: result.sub_category,
                received_at: msg.receivedAt,
              });

              // Only insert new classifications
              const key = `${account.id}_${msg.id}`;
              if (!classifiedSet.has(key)) {
                newClassifications.push({
                  account_email: account.address,
                  account_id: account.id,
                  message_id: msg.id,
                  subject: msg.subject,
                  sender: msg.sender,
                  received_at: msg.receivedAt,
                  category: result.category,
                  sub_category: result.sub_category,
                  confidence: result.confidence,
                  extracted_data: result.extracted_data,
                  pattern_matched: result.pattern_matched,
                });
                classifiedSet.add(key);
              }
            }

            // Batch insert new classifications
            if (newClassifications.length > 0) {
              const { error: classErr } = await supabaseClient
                .from('email_classifications')
                .upsert(newClassifications, {
                  onConflict: 'account_id,message_id',
                  ignoreDuplicates: true,
                });
              if (classErr) console.error(`[INTELLIGENCE] Classification insert error:`, classErr);
              else totalNewClassifications += newClassifications.length;
            }

            // Compute account state from ALL classifications
            const stateResult = computeAccountState(allClassificationsForState);

            // Find key dates for metadata
            const sortedEmails = [...allClassificationsForState].sort(
              (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
            );
            const bgcClear = sortedEmails.find(c => c.category === 'BGC' && c.sub_category === 'bgc_clear');
            const deactEmail = sortedEmails.find(c => c.category === 'DEACTIVATION');
            const firstActiveEmail = sortedEmails.find(c => c.category === 'ACTIVE');
            const firstEmailDate = sortedEmails.length > 0 ? sortedEmails[0].received_at : null;
            const lastEmailDate = sortedEmails.length > 0 ? sortedEmails[sortedEmails.length - 1].received_at : null;

            // Category distribution for metadata
            const categoryCount: Record<string, number> = {};
            for (const c of allClassificationsForState) {
              categoryCount[c.category] = (categoryCount[c.category] || 0) + 1;
            }

            // Upsert account state
            const stateData = {
              account_email: account.address,
              current_state: stateResult.current_state,
              previous_state: stateResult.previous_state,
              state_confidence: stateResult.state_confidence,
              lifecycle_score: stateResult.lifecycle_score,
              anomaly_flags: stateResult.anomaly_flags,
              days_in_state: 0,
              email_count: allMessages.length,
              first_email_at: firstEmailDate,
              last_email_at: lastEmailDate,
              last_analyzed_at: new Date().toISOString(),
              metadata: {
                category_distribution: categoryCount,
                bgc_clear_date: bgcClear?.received_at || null,
                deact_date: deactEmail?.received_at || null,
                first_active_date: firstActiveEmail?.received_at || null,
              },
              updated_at: new Date().toISOString(),
            };

            const { error: stateErr } = await supabaseClient
              .from('account_states')
              .upsert(stateData, { onConflict: 'account_email' });

            if (stateErr) console.error(`[INTELLIGENCE] State upsert error:`, stateErr);
            else statesUpdated++;

            // Update cross-account data
            allAccountStateData.set(account.address, {
              state: stateResult.current_state,
              bgcDate: bgcClear ? new Date(bgcClear.received_at) : undefined,
              deactDate: deactEmail ? new Date(deactEmail.received_at) : undefined,
              firstEmailDate: firstEmailDate ? new Date(firstEmailDate) : undefined,
              lastEmailDate: lastEmailDate ? new Date(lastEmailDate) : undefined,
            });

            // Generate insights
            const accountInsights = generateInsights(
              account.address,
              stateResult.current_state,
              allClassificationsForState,
              stateResult.anomaly_flags,
              allAccountStateData
            );

            if (accountInsights.length > 0) {
              // Delete old non-dismissed insights for this account
              await supabaseClient
                .from('account_insights')
                .delete()
                .eq('account_email', account.address)
                .eq('is_dismissed', false);

              const insightRows = accountInsights.map(ins => ({
                account_email: account.address,
                insight_type: ins.insight_type,
                priority: ins.priority,
                title: ins.title,
                description: ins.description,
                suggested_action: ins.suggested_action,
              }));

              const { error: insightErr } = await supabaseClient
                .from('account_insights')
                .insert(insightRows);

              if (insightErr) console.error(`[INTELLIGENCE] Insight insert error:`, insightErr);
              else insightsGenerated += insightRows.length;
            }

          } catch (e) {
            console.error(`[INTELLIGENCE] Error processing ${account.address}:`, e);
          }
        }

        const elapsedMs = Date.now() - startTime;

        // Build state distribution
        const stateDistribution: Record<string, number> = {};
        for (const [, data] of allAccountStateData) {
          stateDistribution[data.state] = (stateDistribution[data.state] || 0) + 1;
        }

        // Create notification if significant findings
        const urgentInsights = insightsGenerated;
        if (urgentInsights > 0) {
          await createNotifications(
            supabaseClient,
            'scan_complete',
            `Derin Analiz Tamamlandı`,
            `${statesUpdated} hesap analiz edildi, ${insightsGenerated} içgörü üretildi.`,
            { statesUpdated, insightsGenerated, stateDistribution }
          );
        }

        console.log(`[INTELLIGENCE] Done in ${elapsedMs}ms. States: ${statesUpdated}, Classifications: ${totalNewClassifications}, Insights: ${insightsGenerated}`);

        result = {
          processed: accountsBatch.length,
          remaining: accountsToProcess.length - accountsBatch.length,
          total: allAccounts.length,
          totalEmailsScanned: totalClassified,
          newClassifications: totalNewClassifications,
          statesUpdated,
          insightsGenerated,
          stateDistribution,
          elapsedMs,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('SMTP API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
