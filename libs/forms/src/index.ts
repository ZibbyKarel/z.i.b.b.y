// Form harness
export { Form, useFormControls } from "./Form"
export type { FormControlsOptions, FormControls, FormProps } from "./Form"

// Wrappers
export { FormMarkdownEditor } from "./FormMarkdownEditor"
export type { FormMarkdownEditorProps } from "./FormMarkdownEditor"
export { FormSegmentPicker } from "./FormSegmentPicker"
export type { FormSegmentPickerProps } from "./FormSegmentPicker"
export { FormSelect } from "./FormSelect"
export type { FormSelectProps } from "./FormSelect"
export { FormTextArea } from "./FormTextArea"
export type { FormTextAreaProps } from "./FormTextArea"
export { FormTextInput } from "./FormTextInput"
export type { FormTextInputProps } from "./FormTextInput"
export { FormToggle } from "./FormToggle"
export type { FormToggleProps } from "./FormToggle"

// zodResolver — app code imports only from @zibby/forms
export { zodResolver } from "./zodResolver"

// Re-exports from react-hook-form — app code imports only from @zibby/forms
export { Controller, useFormContext, useWatch } from "react-hook-form"
export type {
  Control,
  FieldPath,
  FieldValues,
  Path,
  SubmitHandler,
  UseFormProps,
  UseFormReturn,
} from "react-hook-form"
