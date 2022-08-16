export type RequestData = {
  userId: string;
  ip: string;
  method: string;
  path: string;
  userAgent?: string;
  email?: string;
};

export interface InstallTemplateData {
  os: string;
  installationInstruction: string;
}
