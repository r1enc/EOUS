import Markdown from "react-markdown";

interface AssistantMarkdownProps {
  content: string;
}

function safeLinkUrl(value: string): string {
  if (
    !/^https?:\/\//i.test(value) ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return "";
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="message-content assistant-markdown">
      <Markdown
        skipHtml
        urlTransform={safeLinkUrl}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (alt ? <span>{alt}</span> : null)
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
