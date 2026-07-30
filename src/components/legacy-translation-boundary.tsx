"use client";

import * as React from "react";
import { useI18n } from "@/lib/i18n";
import { translateLegacyText } from "@/lib/legacy-ui-messages";

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;
let originalText = new WeakMap<Text, string>();
let originalAttributes = new WeakMap<Element, Map<string, string>>();
let lastAppliedText = new WeakMap<Text, string>();

export function LegacyTranslationBoundary({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();

  React.useEffect(() => {
    const root = document.body;
    // React has already committed the new locale. Capture that fresh source
    // instead of reusing nodes remembered under the previous locale.
    originalText = new WeakMap<Text, string>();
    originalAttributes = new WeakMap<Element, Map<string, string>>();
    lastAppliedText = new WeakMap<Text, string>();
    let applying = false;

    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const parent = textNode.parentElement;
        if (
          !parent ||
          parent.closest("[data-no-translate], [contenteditable='true']") ||
          ["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)
        ) {
          return;
        }
        if (!originalText.has(textNode)) {
          originalText.set(textNode, textNode.data);
        }
        const source = originalText.get(textNode) ?? textNode.data;
        const next = translateLegacyText(source, locale);
        if (textNode.data !== next) {
          lastAppliedText.set(textNode, next);
          textNode.data = next;
        }
        return;
      }

      if (!(node instanceof Element)) return;
      if (node.matches("[data-no-translate], [contenteditable='true']")) return;

      let attributes = originalAttributes.get(node);
      if (!attributes) {
        attributes = new Map<string, string>();
        originalAttributes.set(node, attributes);
      }
      for (const name of TRANSLATABLE_ATTRIBUTES) {
        const current = node.getAttribute(name);
        if (current != null && !attributes.has(name)) attributes.set(name, current);
        const source = attributes.get(name);
        if (source != null) {
          const next = translateLegacyText(source, locale);
          if (current !== next) node.setAttribute(name, next);
        }
      }

      for (const child of Array.from(node.childNodes)) translateNode(child);
    };

    const apply = (node: Node) => {
      if (applying) return;
      applying = true;
      translateNode(node);
      applying = false;
    };

    apply(root);
    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const textNode = mutation.target as Text;
          const translatedValue = lastAppliedText.get(textNode);
          if (translatedValue === textNode.data) {
            lastAppliedText.delete(textNode);
            continue;
          }
          // React updated an existing text node (for example, a calculated
          // weight or kcal total). Treat the new value as fresh source text;
          // otherwise the translator would restore the value captured when
          // the node first mounted.
          originalText.set(textNode, textNode.data);
          apply(textNode);
        } else {
          for (const addedNode of Array.from(mutation.addedNodes)) apply(addedNode);
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [locale]);

  return <>{children}</>;
}
