import { useState, useCallback, createContext, useContext } from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType>({
  confirm: () => Promise.resolve(false),
});

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setResolver(() => resolve);
    });
  }, []);

  function handleConfirm() {
    resolver?.(true);
    setOptions(null);
    setResolver(null);
  }

  function handleCancel() {
    resolver?.(false);
    setOptions(null);
    setResolver(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {/* Dialog Overlay */}
      {options && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800">{options.title}</h3>
            <p className="text-sm text-gray-600 mt-2">{options.message}</p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border rounded-lg"
              >
                {options.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm text-white rounded-lg ${
                  options.destructive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {options.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}
