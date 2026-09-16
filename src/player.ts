import { copyText, element, showMessage, textElement } from './dom';
import { NavigatorError } from './errors';
import type { VideoSource } from './github';
import type { Recording } from './metadata';
import {
  activeGroup,
  activeIndex,
  formatTime,
  timestampLabel,
} from './timeline';
import { shareUrl } from './urls';

export class Player {
  readonly video = element<HTMLVideoElement>('video');
  private source?: VideoSource;
  private recording?: Recording;
  private demo = false;
  private ready = false;
  private pendingTime = 0;
  private localUrl?: string;
  private frame?: number;
  private mediaTimeout?: number;
  private chapterLinks: HTMLAnchorElement[] = [];
  private noteElements: HTMLLIElement[] = [];
  private noteLinks: HTMLAnchorElement[] = [];
  private activeNote = -2;
  private activeChapter = -2;
  private sharedTime = 0;
  private readonly follow = element<HTMLInputElement>('follow-playback');
  private readonly scroller = element('reasoning-scroll');
  private readonly speed = element<HTMLSelectElement>('playback-speed');
  private readonly error = element('media-error');
  private readonly mediaHelp = element<HTMLDetailsElement>('media-help');

  constructor() {
    this.video.addEventListener('loadedmetadata', () => {
      this.ready = true;
      this.clearMediaTimeout();
      showMessage(this.error, '');
      this.video.playbackRate = Number(this.speed.value);
      this.updateWarnings();
      this.seek(this.pendingTime);
      this.sync();
    });
    this.video.addEventListener('durationchange', () => {
      if (this.ready) this.updateWarnings();
      this.sync();
    });
    for (const event of ['timeupdate', 'seeked', 'seeking', 'ended']) {
      this.video.addEventListener(event, () => this.sync());
    }
    this.video.addEventListener('playing', () => this.startFrames());
    this.video.addEventListener('pause', () => this.stopFrames());
    this.video.addEventListener('ended', () => this.stopFrames());
    this.video.addEventListener('error', () => {
      if (!this.recording) return;
      this.clearMediaTimeout();
      this.stopFrames();
      const messages: Record<number, string> = {
        1: 'Video loading was interrupted. Try opening the original or selecting a local copy.',
        2: 'The video could not be downloaded. GitHub access restrictions, download limits, or a network error may be blocking it.',
        3: 'The browser could not decode this video. Try an H.264 MP4 copy of the same recording.',
        4: 'The video is unavailable or its format is not supported by this browser. Open the original on GitHub or select a local copy.',
      };
      showMessage(
        this.error,
        messages[this.video.error?.code ?? 0] ??
          'Video playback failed. Open the original on GitHub or select a local copy.',
      );
      this.mediaHelp.open = true;
    });
    this.speed.addEventListener('change', () => {
      this.video.playbackRate = Number(this.speed.value);
    });
    this.video.addEventListener('ratechange', () => {
      const value = String(this.video.playbackRate);
      if ([...this.speed.options].some((option) => option.value === value)) {
        this.speed.value = value;
      }
    });
    element<HTMLSelectElement>('recording-select').addEventListener(
      'change',
      (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLSelectElement)) return;
        this.select(Number(target.value), 0);
        history.replaceState(null, '', this.link());
      },
    );
    this.follow.addEventListener('change', () => {
      if (this.follow.checked) this.scrollToCurrent();
    });
    this.scroller.addEventListener(
      'wheel',
      () => {
        this.follow.checked = false;
      },
      { passive: true },
    );
    this.scroller.addEventListener(
      'touchmove',
      () => {
        this.follow.checked = false;
      },
      { passive: true },
    );
    this.scroller.addEventListener('keydown', (event) => {
      if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(
          event.key,
        )
      ) {
        this.follow.checked = false;
      }
    });
    element<HTMLInputElement>('local-video').addEventListener(
      'change',
      (event) => {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement)) return;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (
          !file.size ||
          (!file.type.startsWith('video/') &&
            !/\.(mp4|mov|webm)$/i.test(file.name))
        ) {
          showMessage(
            this.error,
            'Select a nonempty MP4, MOV, or WebM video file.',
          );
          return;
        }
        this.setMedia(URL.createObjectURL(file), this.video.currentTime, true);
        element('local-status').textContent =
          `Using ${file.name} from your device. This file is not uploaded or included in shared links.`;
        element('use-original').hidden = false;
      },
    );
    element('use-original').addEventListener('click', () => {
      if (!this.recording) return;
      this.setMedia(this.originalUrl(), this.video.currentTime);
    });
    element('share-video').addEventListener('click', () => {
      this.sharedTime = this.video.currentTime;
      element('share-time-label').textContent =
        `Start at ${timestampLabel(this.sharedTime)}`;
      element<HTMLInputElement>('share-timestamp').checked = true;
      element('share-status').textContent = '';
      this.updateShare();
      element<HTMLDialogElement>('share-dialog').showModal();
    });
    element('share-timestamp').addEventListener('change', () =>
      this.updateShare(),
    );
    element('copy-share').addEventListener('click', () => {
      void this.copyShare();
    });
  }

  get loaded(): boolean {
    return Boolean(this.recording);
  }

  open(
    source: VideoSource,
    demo: boolean,
    selection: number,
    time: number,
  ): void {
    if (!source.recordings.some((recording) => recording.index === selection)) {
      throw new NavigatorError(
        `Video ${selection} does not exist in this body. It contains ${source.recordings.length} recording(s).`,
        'input',
      );
    }
    this.reset();
    this.source = source;
    this.demo = demo;
    const link = element<HTMLAnchorElement>('source-link');
    link.href =
      source.url || 'https://github.com/BagToad/github-video-navigator';
    link.textContent = source.label;
    element('source-author').textContent = source.author
      ? source.author === 'Deleted user'
        ? 'by a deleted user'
        : `by @${source.author}`
      : '';
    element('demo-label').hidden = !demo;
    element('video-selector').hidden = source.recordings.length < 2;
    const select = element<HTMLSelectElement>('recording-select');
    select.replaceChildren();
    for (const recording of source.recordings) {
      const option = textElement(
        'option',
        `${recording.index}. ${recording.metadata?.title ?? `Recording ${recording.index}`}`,
      );
      option.value = String(recording.index);
      select.append(option);
    }
    this.select(selection, time);
  }

  reset(): void {
    this.recording = undefined;
    this.source = undefined;
    this.video.pause();
    this.stopFrames();
    this.clearMediaTimeout();
    this.video.removeAttribute('src');
    this.video.removeAttribute('poster');
    this.video.replaceChildren();
    this.video.load();
    this.releaseLocal();
    this.ready = false;
    this.activeNote = -2;
    this.activeChapter = -2;
  }

  link(time = this.video.currentTime): string {
    return shareUrl(
      window.location.href,
      this.demo ? undefined : this.source?.url,
      this.recording?.index ?? 1,
      time,
    );
  }

  private select(index: number, time: number): void {
    const recording = this.source?.recordings.find(
      (item) => item.index === index,
    );
    if (!recording) {
      throw new NavigatorError(
        'The selected recording is no longer available.',
        'input',
      );
    }
    this.recording = recording;
    this.activeNote = -2;
    this.activeChapter = -2;
    this.follow.checked = true;
    this.follow.disabled = !recording.metadata?.reasoning.length;
    element<HTMLSelectElement>('recording-select').value = String(index);
    element('recording-title').textContent =
      recording.metadata?.title ?? this.source?.title ?? 'GitHub recording';
    document.title = `${element('recording-title').textContent} | Video navigator`;
    element<HTMLAnchorElement>('attachment-link').href = this.originalUrl();
    this.mediaHelp.open = false;
    this.renderChapters();
    this.renderNotes();
    this.setMedia(this.originalUrl(), time);
    this.scroller.scrollTop = 0;
  }

  private originalUrl(): string {
    return this.demo
      ? new URL('./demo/walkthrough.mp4', document.baseURI).href
      : (this.recording?.video ?? '');
  }

  private setMedia(url: string, time: number, local = false): void {
    this.video.pause();
    this.stopFrames();
    this.clearMediaTimeout();
    this.video.removeAttribute('src');
    this.video.replaceChildren();
    this.releaseLocal();
    if (local) this.localUrl = url;
    else {
      element('local-status').textContent =
        'Local files stay on your device. They are never uploaded.';
      element('use-original').hidden = true;
    }
    if (this.demo && !local) {
      this.video.poster = new URL('./demo/poster.webp', document.baseURI).href;
      const track = document.createElement('track');
      track.kind = 'captions';
      track.srclang = 'en';
      track.label = 'English';
      track.src = new URL('./demo/captions.vtt', document.baseURI).href;
      this.video.append(track);
    } else {
      this.video.removeAttribute('poster');
    }
    this.pendingTime = time;
    this.ready = false;
    showMessage(this.error, '');
    this.video.src = url;
    this.video.load();
    this.updateWarnings();
    this.sync(0);
    this.mediaTimeout = window.setTimeout(() => {
      if (this.ready || !this.recording) return;
      showMessage(
        this.error,
        'The video is taking longer than expected to load. Open the original to check access, or select a local copy.',
      );
      this.mediaHelp.open = true;
    }, 25_000);
  }

  private releaseLocal(): void {
    if (this.localUrl) URL.revokeObjectURL(this.localUrl);
    this.localUrl = undefined;
  }

  private clearMediaTimeout(): void {
    window.clearTimeout(this.mediaTimeout);
    this.mediaTimeout = undefined;
  }

  private seek(time: number): void {
    if (!this.ready) {
      this.pendingTime = time;
      return;
    }
    if (Number.isFinite(this.video.duration) && time > this.video.duration) {
      showMessage(
        this.error,
        `The requested time (${timestampLabel(time)}) is beyond this video's duration (${timestampLabel(this.video.duration)}).`,
      );
      this.pendingTime = 0;
      return;
    }
    this.pendingTime = time;
    this.video.currentTime = time;
    this.sync(time);
  }

  private timestampLink(
    time: number,
    label: string,
    className: string,
  ): HTMLAnchorElement {
    const link = textElement('a', timestampLabel(time), className);
    link.href = this.link(time);
    link.setAttribute(
      'aria-label',
      `Jump to ${label} at ${timestampLabel(time)}`,
    );
    link.addEventListener('click', (event) => {
      if (
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      this.seek(time);
    });
    return link;
  }

  private renderChapters(): void {
    const chapters = this.recording?.metadata?.chapters ?? [];
    const list = element('chapter-list');
    list.replaceChildren();
    this.chapterLinks = [];
    element('chapter-count').textContent = String(chapters.length);
    element('chapters-empty').hidden = chapters.length > 0;
    for (const chapter of chapters) {
      const item = document.createElement('li');
      const link = this.timestampLink(
        chapter.at,
        chapter.title,
        'chapter-link',
      );
      link.replaceChildren(
        textElement('span', timestampLabel(chapter.at), 'chapter-time'),
      );
      const copy = document.createElement('span');
      copy.append(textElement('span', chapter.title, 'chapter-name'));
      if (chapter.description) {
        copy.append(
          textElement('span', chapter.description, 'chapter-description'),
        );
      }
      link.append(copy);
      link.removeAttribute('aria-label');
      item.append(link);
      list.append(item);
      this.chapterLinks.push(link);
    }
  }

  private renderNotes(): void {
    const notes = this.recording?.metadata?.reasoning ?? [];
    const list = element('reasoning-list');
    list.replaceChildren();
    this.noteElements = [];
    this.noteLinks = [];
    element('reasoning-count').textContent = String(notes.length);
    element('reasoning-empty').hidden = notes.length > 0;
    for (const note of notes) {
      const item = textElement('li', '', 'note');
      const kind = note.kind ?? 'decision';
      const label = kind.charAt(0).toUpperCase() + kind.slice(1);
      const meta = textElement('div', '', 'note-meta');
      const link = this.timestampLink(
        note.at,
        note.title ?? label,
        'note-time',
      );
      meta.append(link, textElement('span', label, 'note-kind'));
      if (note.agent)
        meta.append(textElement('span', note.agent, 'note-agent'));
      item.append(meta);
      if (note.title) item.append(textElement('h3', note.title, 'note-title'));
      item.append(textElement('p', note.text, 'note-text'));
      list.append(item);
      this.noteElements.push(item);
      this.noteLinks.push(link);
    }
  }

  private updateWarnings(): void {
    const metadata = this.recording?.metadata;
    const warnings = [
      ...(this.source?.warnings ?? []),
      ...(this.recording?.warnings ?? []),
    ];
    if (!metadata) {
      warnings.push(
        'No valid video-navigator metadata was found for this recording. The video can still play without chapters or notes.',
      );
    }
    const duration =
      this.ready && Number.isFinite(this.video.duration)
        ? this.video.duration
        : Infinity;
    let outside = 0;
    for (const [index, chapter] of (metadata?.chapters ?? []).entries()) {
      const disabled = chapter.at > duration;
      this.chapterLinks[index]?.setAttribute('aria-disabled', String(disabled));
      if (disabled) outside++;
    }
    for (const [index, note] of (metadata?.reasoning ?? []).entries()) {
      const disabled = note.at > duration;
      this.noteLinks[index]?.setAttribute('aria-disabled', String(disabled));
      if (disabled) outside++;
    }
    if (outside) {
      warnings.push(
        `${outside} timestamp(s) fall beyond this video's duration and cannot be selected.`,
      );
    }
    const target = element('metadata-notice');
    target.replaceChildren(
      ...warnings.map((warning) => textElement('p', warning)),
    );
    target.hidden = warnings.length === 0;
  }

  private sync(time = this.video.currentTime): void {
    if (!this.recording) return;
    const duration = Number.isFinite(this.video.duration)
      ? formatTime(this.video.duration)
      : '--:--';
    element('playback-time').textContent = `${formatTime(time)} / ${duration}`;
    const chapters = this.recording.metadata?.chapters ?? [];
    const chapter = activeIndex(chapters, time);
    if (chapter !== this.activeChapter) {
      this.activeChapter = chapter;
      for (const [index, link] of this.chapterLinks.entries()) {
        if (index === chapter) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
      element('now-chapter').textContent = chapters[chapter]?.title ?? '';
    }
    const notes = this.recording.metadata?.reasoning ?? [];
    const group = activeGroup(notes, time);
    if (group.end === this.activeNote) return;
    this.activeNote = group.end;
    for (const [index, item] of this.noteElements.entries()) {
      const current = index >= group.start && index <= group.end;
      item.classList.toggle('is-current', current);
      if (current) this.noteLinks[index]?.setAttribute('aria-current', 'true');
      else this.noteLinks[index]?.removeAttribute('aria-current');
    }
    const note = notes[group.start];
    element('reasoning-position').textContent = note
      ? `At ${timestampLabel(note.at)}`
      : notes[0]
        ? `First note at ${timestampLabel(notes[0].at)}`
        : 'No notes attached';
    element('note-announcement').textContent = note
      ? `Current note at ${timestampLabel(note.at)}: ${note.title ?? note.kind ?? 'Decision'}.`
      : '';
    if (this.follow.checked) this.scrollToCurrent();
  }

  private scrollToCurrent(): void {
    const notes = this.recording?.metadata?.reasoning ?? [];
    const group = activeGroup(notes, this.video.currentTime);
    const item = this.noteElements[group.start];
    if (!item) {
      this.scroller.scrollTop = 0;
      return;
    }
    const top =
      item.getBoundingClientRect().top -
      this.scroller.getBoundingClientRect().top +
      this.scroller.scrollTop -
      10;
    this.scroller.scrollTo({
      top,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }

  private startFrames(): void {
    this.stopFrames();
    if (!('requestVideoFrameCallback' in this.video)) return;
    const update: VideoFrameRequestCallback = () => {
      this.sync();
      if (!this.video.paused && !this.video.ended) {
        this.frame = this.video.requestVideoFrameCallback(update);
      }
    };
    this.frame = this.video.requestVideoFrameCallback(update);
  }

  private stopFrames(): void {
    if (this.frame !== undefined)
      this.video.cancelVideoFrameCallback(this.frame);
    this.frame = undefined;
  }

  private updateShare(): void {
    const includeTime = element<HTMLInputElement>('share-timestamp').checked;
    element<HTMLInputElement>('share-url').value = this.link(
      includeTime ? this.sharedTime : 0,
    );
  }

  private async copyShare(): Promise<void> {
    const input = element<HTMLInputElement>('share-url');
    if (await copyText(input.value)) {
      element('share-status').textContent = 'Link copied.';
    } else {
      input.focus();
      input.select();
      element('share-status').textContent =
        'Automatic copy is unavailable. The link is selected so you can copy it manually.';
    }
  }
}
