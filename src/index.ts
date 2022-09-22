import * as http from "http";
import * as https from "https";
import * as tls from "tls";

interface IResolvedValues {
  valid: boolean;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  validFor: string[];
}

const checkPort = (port: unknown): boolean =>
  !isNaN(parseFloat(port as string)) && Math.sign(port as number) === 1;
const getDaysBetween = (validFrom: Date, validTo: Date): number =>
  Math.round(Math.abs(+validFrom - +validTo) / 8.64e7);
const getDaysRemaining = (validFrom: Date, validTo: Date): number => {
  const daysRemaining = getDaysBetween(validFrom, validTo);

  if (new Date(validTo).getTime() < new Date().getTime()) {
    return -daysRemaining;
  }

  return daysRemaining;
};

const DEFAULT_OPTIONS: Partial<https.RequestOptions> = {
  agent: new https.Agent({
    maxCachedSessions: 0
  }),
  method: "HEAD",
  port: 443,
  rejectUnauthorized: false,
};

const sslChecker = (
  host: string,
  options: Partial<https.RequestOptions> = {}
): Promise<IResolvedValues> =>
  new Promise((resolve, reject) => {
    options = Object.assign({}, DEFAULT_OPTIONS, options);

    if (!checkPort(options.port)) {
      reject(Error("Invalid port"));
      return;
    }

    try {
      const req = https.request(
        { host, ...options },
        (res: http.IncomingMessage) => {
          const {
            valid_from,
            valid_to,
            subjectaltname,
          } = (res.connection as tls.TLSSocket).getPeerCertificate();

          if (!valid_from || !valid_to || !subjectaltname) {
            reject(new Error('No certificate'));
            return;
          }

          const validTo = new Date(valid_to);

          const validFor = subjectaltname
            .replace(/DNS:|IP Address:/g, "")
            .split(", ");

          resolve({
            daysRemaining: getDaysRemaining(new Date(), validTo),
            valid:
              ((res.socket as { authorized?: boolean })
                .authorized as boolean) || false,
            validFrom: new Date(valid_from).toISOString(),
            validTo: validTo.toISOString(),
            validFor,
          });
        }
      );

      // req.on("error", reject);
      // Fix
      req.on('error', function () {
        resolve({
            daysRemaining: 0,
            valid: false,
            validFrom: 'ENONET',
            validTo: 'ENONET',
            validFor: [host]
        });
      });
      req.on("timeout", () => {
          req.abort()
          reject(new Error('Timed Out'))
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });

export default sslChecker;
module.exports = sslChecker;
