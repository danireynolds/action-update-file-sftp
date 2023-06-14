const core = require('@actions/core');

const fs = require('fs');

let Client = require('ssh2-sftp-client')

const getFileContents = path => fs.readFileSync(path).toString();

const escape = (string) => string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

async function run() {
  try {
    const file = core.getInput("file", { required: true });
    const tokenPattern = core.getInput("tokenPattern", { required: true });
    const secretsJson = core.getInput("secretsJson", { required: true });
    const sftpHost = core.getInput("sftpHost", { required: true });
    const sftpUsername = core.getInput("sftpUsername", { required: true });
    const sftpRsaKey = core.getInput("sftpRsaKey", { required: true });
    const sftpFile = core.getInput("sftpFile", { required: true });

    console.log("Substituting tokens matching", tokenPattern, "from file", file);

    const fileContents = getFileContents(file);

    const secrets = JSON.parse(secretsJson);

    const regexPattern = new RegExp(escape(tokenPattern).replace(/TOKEN/, "(.*?)"), "gm");

    const matches = [...fileContents.matchAll(regexPattern)]
      .map((m) => ({
        target: m[0],
        token: m[1],
      }))
      .reduce((acc, next) => (acc.find((a) => a.target === next.target) ? acc : [...acc, next]), []);

    console.log("Found", matches.length, "tokens", matches.map((m) => m.token).join(", "));

    const missing = matches.filter((m) => secrets[m.token] === undefined).map((m) => m.target);

    if (missing.length) console.warn("Missing secrets", missing.length, missing.join(", "));

    const updatedFile = matches
      .filter((m) => secrets[m.token] !== undefined)
      .reduce((acc, next) => acc.replace(new RegExp(escape(next.target), "gm"), secrets[next.token]), fileContents);

    let sftp = new Client();

    console.log('Uploading file to server');

    const sftpConfig = {
      host: sftpHost,
      username: sftpUsername,
      privateKey: sftpRsaKey,
    };

    sftp.connect(sftpConfig)
      .then(() => {
          return sftp.append(Buffer.from(updatedFile), sftpFile, {flags: 'w'});
      })
      .then(() => {
        return sftp.end();
      })
      .catch(err => {
        core.setFailed(err.message);
      })

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();