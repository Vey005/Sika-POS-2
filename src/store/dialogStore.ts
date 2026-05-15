import { create } from 'zustand';

export type DialogType = 'alert' | 'confirm' | 'prompt';

export interface DialogOptions {
  title?: string;
  message: string;
  type: DialogType;
  resolve: (value: any) => void;
  defaultValue?: string;
}

interface DialogState {
  currentDialog: DialogOptions | null;
  showAlert: (message: string, title?: string) => Promise<boolean>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
  showPrompt: (message: string, title?: string, defaultValue?: string) => Promise<string | null>;
  closeDialog: (result: any) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  currentDialog: null,
  showAlert: (message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      set({
        currentDialog: {
          message,
          title: title || 'Alert',
          type: 'alert',
          resolve,
        },
      });
    });
  },
  showConfirm: (message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      set({
        currentDialog: {
          message,
          title: title || 'Confirm',
          type: 'confirm',
          resolve,
        },
      });
    });
  },
  showPrompt: (message: string, title?: string, defaultValue?: string) => {
    return new Promise<string | null>((resolve) => {
      set({
        currentDialog: {
          message,
          title: title || 'Prompt',
          type: 'prompt',
          defaultValue,
          resolve,
        },
      });
    });
  },
  closeDialog: (result: any) => {
    const { currentDialog } = get();
    if (currentDialog) {
      currentDialog.resolve(result);
      set({ currentDialog: null });
    }
  },
}));

// Export helper functions so they can be used outside of React components
export const showAlert = (message: string, title?: string) => 
  useDialogStore.getState().showAlert(message, title);

export const showConfirm = (message: string, title?: string) => 
  useDialogStore.getState().showConfirm(message, title);

export const showPrompt = (message: string, title?: string, defaultValue?: string) => 
  useDialogStore.getState().showPrompt(message, title, defaultValue);
