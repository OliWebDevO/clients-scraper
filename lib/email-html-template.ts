import { categoryToPhrase, cityToFrench, extractCity } from "./utils";

export interface HtmlEmailData {
  businessName: string;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
  hasWebsite: boolean;
}

export interface HtmlEmailOverrides {
  heroHeading?: string;
  heroSubtitle?: string;
  personalMessage?: string;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert **bold** markdown to <strong> tags (after HTML escaping) */
function boldify(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight: 500; color: #ffffff;">$1</strong>');
}

/** Generate default text values from business data */
export function generateDefaults(data: HtmlEmailData): Required<HtmlEmailOverrides> {
  const { prefix, label } = categoryToPhrase(data.category);
  const city = cityToFrench(extractCity(data.address));

  return {
    heroHeading: "Un site web qui reflète la qualité de votre entreprise",
    heroSubtitle: `Bonjour, je suis développeur web à Bruxelles. J'ai remarqué que **${data.businessName}** pourrait bénéficier d'une présence en ligne moderne et performante.`,
    personalMessage:
      `Avec votre excellente réputation dans le domaine ${prefix} **${label}** à **${city}**, un site web professionnel vous permettrait de convertir cette visibilité en clients potentiels.\n\n` +
      `Je peux également développer **une application sur mesure** pour simplifier votre gestion au quotidien : **comptabilité**, **planning du personnel** ou **suivi des stocks** ; le tout accessible depuis n'importe quel appareil.\n\n` +
      `Je serais ravi d'en discuter autour d'un café ou lors d'un court appel téléphonique, sans engagement.\n\n` +
      `Bien cordialement,`,
  };
}

export function buildHtmlEmail(data: HtmlEmailData, overrides?: HtmlEmailOverrides): string {
  const defaults = generateDefaults(data);
  const heroHeading = overrides?.heroHeading || defaults.heroHeading;
  const heroSubtitle = overrides?.heroSubtitle || defaults.heroSubtitle;
  const personalMessage = overrides?.personalMessage || defaults.personalMessage;

  const safeName = esc(data.businessName);
  const ratingStr = data.rating ? `${data.rating}/5` : "N/A";
  const reviewStr = data.reviewCount?.toString() || "0";
  const websiteStat = data.hasWebsite ? "Oui" : "0";

  // Build personal message paragraphs from double-newline separated text
  const paragraphs = personalMessage.split(/\n\n+/).filter(Boolean);
  const messageHtml = paragraphs
    .map((p, i) => {
      const isLast = i === paragraphs.length - 1;
      const escaped = esc(p.trim());
      const formatted = boldify(escaped);
      return `<p style="margin: 0${isLast ? "" : " 0 16px"}; color: rgba(255,255,255,0.85); font-family: 'Fira Sans', sans-serif; font-size: 17px; font-weight: 300; line-height: 1.7;">${formatted}</p>`;
    })
    .join("\n\n                                                                ");

  return `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>Proposition - ${safeName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root { color-scheme: light only; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background-color: #f7f3ec; }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: inherit !important; }
        #MessageViewBody a { color: inherit; text-decoration: none; }
        p { line-height: inherit; }
        /* Force light mode in dark-mode email clients */
        [data-ogsc] body, [data-ogsb] body { background-color: #f7f3ec !important; }
        @media (prefers-color-scheme: dark) {
            body, .body-bg { background-color: #f7f3ec !important; }
            .dark-bg { background-color: #0d0b0e !important; }
            .hero-heading, .hero-text { color: #0d0b0e !important; }
            .dark-text { color: #ffffff !important; }
            .dark-subtext { color: rgba(255,255,255,0.7) !important; }
        }
        @media (max-width: 700px) {
            .row-content { width: 100% !important; }
            .stack .column { width: 100% !important; display: block !important; }
            .hero-heading { font-size: 32px !important; }
            .hero-sub { font-size: 16px !important; }
            .section-heading { font-size: 28px !important; }
            .body-padding { padding-left: 20px !important; padding-right: 20px !important; }
        }
    </style>
</head>
<body class="body-bg" style="background: #f7f3ec; background-color: #f7f3ec; margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="body-bg" style="background: #f7f3ec; background-color: #f7f3ec;">
        <tbody>
            <tr>
                <td>

                    <!-- HERO SECTION -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="body-bg" style="background: #f7f3ec; background-color: #f7f3ec;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="padding-top: 30px; text-align: left; vertical-align: top;">
                                                    <div style="height: 20px; line-height: 20px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td style="text-align: center;">
                                                                <p class="hero-text" style="margin: 0; font-family: 'Fira Sans', sans-serif; font-size: 16px; font-weight: 500; color: #0d0b0e; letter-spacing: 2px; text-transform: uppercase;">Oliver Van Droogenbroeck</p>
                                                                <p class="hero-text" style="margin: 4px 0 0; font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 300; color: #555555;">D&eacute;veloppeur Web</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td class="body-padding" style="padding: 10px 30px;">
                                                                <h1 class="hero-heading" style="margin: 0; color: #0d0b0e; font-family: 'Fira Sans', sans-serif; font-size: 44px; font-weight: 700; line-height: 1.15; text-align: center; letter-spacing: -0.5px;">${esc(heroHeading)}</h1>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td class="body-padding" style="padding: 10px 50px 25px;">
                                                                <p class="hero-text" style="margin: 0; color: #0d0b0e; font-family: 'Fira Sans', sans-serif; font-size: 20px; font-weight: 300; line-height: 1.6; text-align: center;">${boldify(esc(heroSubtitle)).replace(/<strong style="font-weight: 500; color: #ffffff;">/g, '<strong style="font-weight: 600;">')}</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td style="text-align: center;">
                                                                <a href="https://olivervdb.com" target="_blank" style="color: #ffffff; text-decoration: none;">
                                                                    <span style="background: #0d0b0e; background-color: #0d0b0e; border-radius: 60px; color: #ffffff; display: inline-block; font-family: 'Fira Sans', sans-serif; font-size: 17px; font-weight: 500; padding: 14px 36px; text-align: center; letter-spacing: 0.3px;">D&eacute;couvrir mon portfolio &rarr;</span>
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 40px; line-height: 40px; font-size: 1px;">&nbsp;</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- WAVE TRANSITION -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td style="padding: 0; line-height: 0; font-size: 0;">
                                    <img src="https://xeuyjpctjabagductcxq.supabase.co/storage/v1/object/public/email-assets/wave-beige-to-dark.png" width="1440" height="120" style="display: block; width: 100%; height: auto;" alt="">
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- DARK SECTION - Main heading -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="vertical-align: top;">
                                                    <div style="height: 50px; line-height: 50px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td>
                                                                <h2 class="section-heading" style="margin: 0; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 38px; font-weight: 700; line-height: 1.2; text-align: center;">Ce que je peux vous apporter</h2>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 10px; line-height: 10px; font-size: 1px;">&nbsp;</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Subtitle: Un site web -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="vertical-align: top;">
                                                    <div style="height: 20px; line-height: 20px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td>
                                                                <h3 style="margin: 0; color: #e7c5f8; font-family: 'Fira Sans', sans-serif; font-size: 22px; font-weight: 500; line-height: 1.3; text-align: center; letter-spacing: 0.3px;">Un site web</h3>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 10px; line-height: 10px; font-size: 1px;">&nbsp;</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- 3 Website Services -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content stack">
                                        <tbody>
                                            <tr>
                                                <td class="service-col" width="33.33%" style="font-weight: 400; text-align: center; padding: 15px 10px; vertical-align: top; height: 1px;">
                                                    <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; height: 100%;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 28px 16px; vertical-align: middle;">
                                                                <div style="font-size: 32px; line-height: 32px; margin-bottom: 12px;">&#127760;</div>
                                                                <h3 style="margin: 0 0 8px; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 19px; font-weight: 600; line-height: 1.2;">Site Moderne</h3>
                                                                <p style="margin: 0; color: rgba(255,255,255,0.7); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.5;">Design responsive et rapide, optimis&eacute; pour mobile</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td class="service-col" width="33.33%" style="font-weight: 400; text-align: center; padding: 15px 10px; vertical-align: top; height: 1px;">
                                                    <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; height: 100%;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 28px 16px; vertical-align: middle;">
                                                                <div style="font-size: 32px; line-height: 32px; margin-bottom: 12px;">&#128200;</div>
                                                                <h3 style="margin: 0 0 8px; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 19px; font-weight: 600; line-height: 1.2;">Visibilit&eacute; SEO</h3>
                                                                <p style="margin: 0; color: rgba(255,255,255,0.7); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.5;">Attirez de nouveaux clients gr&acirc;ce &agrave; Google</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td class="service-col" width="33.33%" style="font-weight: 400; text-align: center; padding: 15px 10px; vertical-align: top; height: 1px;">
                                                    <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; height: 100%;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 28px 16px; vertical-align: middle;">
                                                                <div style="font-size: 32px; line-height: 32px; margin-bottom: 12px;">&#9889;</div>
                                                                <h3 style="margin: 0 0 8px; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 19px; font-weight: 600; line-height: 1.2;">Cl&eacute; en main</h3>
                                                                <p style="margin: 0; color: rgba(255,255,255,0.7); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.5;">Je m'occupe de tout, du design au d&eacute;ploiement</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Subtitle: Une application de gestion -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="vertical-align: top;">
                                                    <div style="height: 30px; line-height: 30px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td>
                                                                <h3 style="margin: 0; color: #e7c5f8; font-family: 'Fira Sans', sans-serif; font-size: 22px; font-weight: 500; line-height: 1.3; text-align: center; letter-spacing: 0.3px;">Une application de gestion</h3>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 10px; line-height: 10px; font-size: 1px;">&nbsp;</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- 3 App Services -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content stack">
                                        <tbody>
                                            <tr>
                                                <td class="service-col" width="33.33%" style="font-weight: 400; text-align: center; padding: 15px 10px; vertical-align: top; height: 1px;">
                                                    <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; height: 100%;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 28px 16px; vertical-align: middle;">
                                                                <div style="font-size: 32px; line-height: 32px; margin-bottom: 12px;">&#128181;</div>
                                                                <h3 style="margin: 0 0 8px; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 19px; font-weight: 600; line-height: 1.2;">Comptabilit&eacute;</h3>
                                                                <p style="margin: 0; color: rgba(255,255,255,0.7); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.5;">Suivi des factures, d&eacute;penses et revenus en temps r&eacute;el</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td class="service-col" width="33.33%" style="font-weight: 400; text-align: center; padding: 15px 10px; vertical-align: top; height: 1px;">
                                                    <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; height: 100%;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 28px 16px; vertical-align: middle;">
                                                                <div style="font-size: 32px; line-height: 32px; margin-bottom: 12px;">&#128101;</div>
                                                                <h3 style="margin: 0 0 8px; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 19px; font-weight: 600; line-height: 1.2;">Personnel</h3>
                                                                <p style="margin: 0; color: rgba(255,255,255,0.7); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.5;">Planning, pr&eacute;sences et gestion des &eacute;quipes simplifi&eacute;s</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td class="service-col" width="33.33%" style="font-weight: 400; text-align: center; padding: 15px 10px; vertical-align: top; height: 1px;">
                                                    <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; height: 100%;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 28px 16px; vertical-align: middle;">
                                                                <div style="font-size: 32px; line-height: 32px; margin-bottom: 12px;">&#128230;</div>
                                                                <h3 style="margin: 0 0 8px; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 19px; font-weight: 600; line-height: 1.2;">Stocks</h3>
                                                                <p style="margin: 0; color: rgba(255,255,255,0.7); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.5;">Inventaire automatis&eacute; et alertes de r&eacute;approvisionnement</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Stats pills -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto; padding: 30px 0;" width="680" class="row-content stack">
                                        <tbody>
                                            <tr>
                                                <td class="stat-col" width="33.33%" style="text-align: center; padding: 10px 10px; vertical-align: top;">
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.25); border-radius: 100px; height: 90px;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 20px 10px; vertical-align: middle; height: 90px;">
                                                                <h3 style="margin: 0; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 30px; font-weight: 700;">${esc(ratingStr)}</h3>
                                                                <p style="margin: 4px 0 0; color: rgba(255,255,255,0.6); font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 300;">Votre note Google</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td class="stat-col" width="33.33%" style="text-align: center; padding: 10px 10px; vertical-align: top;">
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.25); border-radius: 100px; height: 90px;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 20px 10px; vertical-align: middle; height: 90px;">
                                                                <h3 style="margin: 0; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 30px; font-weight: 700;">${esc(reviewStr)}</h3>
                                                                <p style="margin: 4px 0 0; color: rgba(255,255,255,0.6); font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 300;">Avis clients</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td class="stat-col" width="33.33%" style="text-align: center; padding: 10px 10px; vertical-align: top;">
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid rgba(255,255,255,0.25); border-radius: 100px; height: 90px;">
                                                        <tr>
                                                            <td style="text-align: center; padding: 20px 10px; vertical-align: middle; height: 90px;">
                                                                <h3 style="margin: 0; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 30px; font-weight: 700;">${esc(websiteStat)}</h3>
                                                                <p style="margin: 4px 0 0; color: rgba(255,255,255,0.6); font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 300;">Site web actuel</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Personal message -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="vertical-align: top;">
                                                    <div style="height: 30px; line-height: 30px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td class="body-padding" style="padding: 0 40px;">
                                                                <div style="border-top: 1px solid rgba(255,255,255,0.1); height: 1px;">&nbsp;</div>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 30px; line-height: 30px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td class="body-padding" style="padding: 0 40px;">
                                                                ${messageHtml}
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 30px; line-height: 30px; font-size: 1px;">&nbsp;</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Signature + CTA -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="vertical-align: top;">
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td class="body-padding" style="padding: 0 40px;">
                                                                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; width: 100%;">
                                                                    <tr>
                                                                        <td style="vertical-align: middle; padding-right: 20px;">
                                                                            <p style="margin: 0; color: #ffffff; font-family: 'Fira Sans', sans-serif; font-size: 18px; font-weight: 600;">Oliver Van Droogenbroeck</p>
                                                                            <p style="margin: 3px 0 0; color: rgba(255,255,255,0.5); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300;">D&eacute;veloppeur Web &middot; Bruxelles</p>
                                                                            <p style="margin: 8px 0 0;">
                                                                                <a href="https://olivervdb.com" style="color: #e7c5f8; font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 500; text-decoration: none;">olivervdb.com</a>
                                                                                <span style="color: rgba(255,255,255,0.2); margin: 0 6px;">&middot;</span>
                                                                                <a href="mailto:webdev@olivervdb.com" style="color: rgba(255,255,255,0.5); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; text-decoration: none;">webdev@olivervdb.com</a>
                                                                                <span style="color: rgba(255,255,255,0.2); margin: 0 6px;">&middot;</span>
                                                                                <a href="tel:+32465831107" style="color: rgba(255,255,255,0.5); font-family: 'Fira Sans', sans-serif; font-size: 15px; font-weight: 300; text-decoration: none;">0465 83 11 07</a>
                                                                            </p>
                                                                        </td>
                                                                    </tr>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 30px; line-height: 30px; font-size: 1px;">&nbsp;</div>
                                                    <table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td style="text-align: center;">
                                                                <a href="mailto:webdev@olivervdb.com?subject=Demande%20de%20renseignements%20-%20Site%20web" style="color: #0d0b0e; text-decoration: none;">
                                                                    <span style="background: #e7c5f8; background-color: #e7c5f8; border-radius: 60px; color: #0d0b0e; display: inline-block; font-family: 'Fira Sans', sans-serif; font-size: 17px; font-weight: 500; padding: 14px 36px; text-align: center; letter-spacing: 0.3px;">Me contacter &rarr;</span>
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <div style="height: 50px; line-height: 50px; font-size: 1px;">&nbsp;</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- FOOTER -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="dark-bg" style="background: #0d0b0e; background-color: #0d0b0e;">
                        <tbody>
                            <tr>
                                <td>
                                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 680px; margin: 0 auto;" width="680" class="row-content">
                                        <tbody>
                                            <tr>
                                                <td style="vertical-align: top; padding-bottom: 30px;">
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td style="text-align: center; padding: 10px;">
                                                                <a href="https://olivervdb.com" style="color: rgba(255,255,255,0.5); font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 400; text-decoration: none; padding: 0 12px;">Portfolio</a>
                                                                <a href="https://github.com/OliWebDevO/" style="color: rgba(255,255,255,0.5); font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 400; text-decoration: none; padding: 0 12px;">GitHub</a>
                                                                <a href="https://www.linkedin.com/in/oliver-van-droogenbroeck-44b699151/" style="color: rgba(255,255,255,0.5); font-family: 'Fira Sans', sans-serif; font-size: 14px; font-weight: 400; text-decoration: none; padding: 0 12px;">LinkedIn</a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                                        <tr>
                                                            <td style="text-align: center; padding: 15px 10px 5px;">
                                                                <p style="margin: 0; color: rgba(255,255,255,0.25); font-family: 'Fira Sans', sans-serif; font-size: 11px; font-weight: 300;">Bruxelles, Belgique</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                </td>
            </tr>
        </tbody>
    </table>
</body>
</html>`;
}

/** Marker stored in the email_templates body to identify the HTML designed template */
export const HTML_TEMPLATE_MARKER = "__HTML_DESIGNED_TEMPLATE__";
