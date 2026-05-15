import { Button } from "@/components";
import { SparklesIcon } from "lucide-react";
import { UseCompletionReturn } from "@/types";

export const Screenshot = ({
  input,
  isLoading,
  submit,
  screenshotConfiguration,
}: Pick<UseCompletionReturn, "input" | "isLoading" | "submit" | "screenshotConfiguration">) => {
  const canSubmit = input.trim().length > 0 || screenshotConfiguration.enabled;

  return (
    <Button
      type="button"
      className="cursor-pointer bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 border border-emerald-400/50 text-white rounded-full px-5 font-semibold shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all duration-300 transform hover:scale-[1.02] gap-1.5 min-w-[75px]"
      title="Send your message (Enter also works)"
      onClick={() => void submit()}
      disabled={isLoading || !canSubmit}
    >
      <SparklesIcon className="h-4 w-4 fill-current" />
      <span>Ask</span>
    </Button>
  );
};
