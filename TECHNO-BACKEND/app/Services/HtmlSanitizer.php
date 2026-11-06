<?php
namespace App\Services;

use HTMLPurifier;
use HTMLPurifier_Config;

/**
 * Cleans student-authored document HTML (in-app drafts, DOCX→HTML
 * conversions) before it's stored or handed back to a browser.
 *
 * Drafts are rendered to advisers/instructors/panelists as real HTML, and
 * the API token lives in localStorage -- so a <script>, an onerror=
 * handler or a javascript: link in a draft would run in a faculty member's
 * session. Everything that can execute is removed; the formatting the
 * in-app editor produces (headings, lists, tables, inline styles from the
 * toolbar, the data-page-* pagination markers) is kept.
 *
 * The frontend also sanitizes on display (src/utils/sanitizeHtml.js), so
 * drafts saved before this existed are safe too.
 */
class HtmlSanitizer {
    private ?HTMLPurifier $purifier = null;

    public function clean(?string $html): string {
        if ($html === null || $html === '') return '';
        return $this->purifier()->purify($html);
    }

    private function purifier(): HTMLPurifier {
        if ($this->purifier) return $this->purifier;

        $config = HTMLPurifier_Config::createDefault();

        $cacheDir = storage_path('app/purifier');
        if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
        $config->set('Cache.SerializerPath', $cacheDir);

        $config->set('HTML.Doctype', 'HTML 4.01 Transitional');
        // Pagination markers written by the in-app editor (see pagination.js).
        $pg = 'data-page-break|data-page-spacer|data-page-gutter';
        $config->set('HTML.Allowed', implode(',', [
            "p[style|align|{$pg}]", "div[style|align|{$pg}]", 'span[style]', 'br', 'hr',
            'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'small', 'big',
            'font[color|face|size]',
            "h1[style|{$pg}]", "h2[style|{$pg}]", "h3[style|{$pg}]", "h4[style|{$pg}]", "h5[style|{$pg}]", "h6[style|{$pg}]",
            "ul[style|{$pg}]", "ol[style|start|type|{$pg}]", 'li[style]',
            "blockquote[style|{$pg}]", 'pre', 'code',
            "table[style|border|cellpadding|cellspacing|width|{$pg}]", 'caption', 'colgroup', 'col[width|span]',
            'thead', 'tbody', 'tfoot', 'tr[style]',
            'th[style|colspan|rowspan|width|align|valign]', 'td[style|colspan|rowspan|width|align|valign]',
            'a[href|title]', 'img[src|alt|width|height|style]',
        ]));
        $config->set('CSS.AllowedProperties', [
            'font', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration',
            'color', 'background-color', 'text-align', 'text-indent', 'line-height', 'vertical-align',
            'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
            'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
            'width', 'height', 'border', 'border-collapse', 'list-style-type',
        ]);
        // http(s)/mailto links; data: only ever passes for images
        // (HTMLPurifier's data scheme accepts image MIME types only).
        $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true, 'mailto' => true, 'data' => true]);
        $config->set('Attr.AllowedFrameTargets', []);
        $config->set('AutoFormat.RemoveEmpty', false);

        // The editor's pagination markers (data-page-break / -spacer /
        // -gutter) aren't standard HTML 4 attributes; declare them.
        $config->set('HTML.DefinitionID', 'thesisguard-drafts');
        $config->set('HTML.DefinitionRev', 2);
        if ($def = $config->maybeGetRawHTMLDefinition()) {
            foreach (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'ul', 'ol', 'blockquote'] as $tag) {
                foreach (['data-page-break', 'data-page-spacer', 'data-page-gutter'] as $attr) {
                    $def->addAttribute($tag, $attr, 'Text');
                }
            }
        }

        return $this->purifier = new HTMLPurifier($config);
    }
}
