import { checkSms, checkEmail } from "@justcheckingmate/engine/scamDetector";
const bodies: [string,string][] = [
  ["clickfix", "Your browser needs a security fix. Press Win+R, paste the command below and hit Enter to verify you are human."],
  ["otp-relay", "This is CommBank security. We just sent you a 6-digit code — please read it back to us to confirm your identity."],
  ["task-scam", "Congratulations, your account has earned $340. To withdraw your commission you must first complete a $50 deposit task."],
  ["msg-hijack", "WhatsApp: your account has been flagged for unusual activity and will be restricted within 24 hours."],
  ["keyword-only", "URGENT: act now, your account is suspended, verify immediately, claim your refund before it expires."],
  ["govt-impersonation", "ATO FINAL NOTICE: a warrant is out for your arrest over an unpaid tax debt. Call us immediately."],
];
console.log("body                sms   email  ratio");
for (const [l, b] of bodies) {
  const withHeaders = `From: Someone <x@example.invalid>\nSubject: hi\n\n${b}`;
  const s = checkSms(b, undefined, "AU");
  const e = checkEmail(withHeaders, undefined, "AU");
  console.log(`${l.padEnd(20)} ${String(s.score).padStart(3)} ${s.verdict.padEnd(12)} ${String(e.score).padStart(3)} ${e.verdict.padEnd(12)}`);
}
