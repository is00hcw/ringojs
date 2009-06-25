package org.helma.repository;

import javax.servlet.ServletContext;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URL;

public class WebappResource extends AbstractResource {

    ServletContext context;
    private int exists = -1;

    protected WebappResource(ServletContext context, WebappRepository repository, String name) {
        this.context = context;
        this.repository = repository;
        this.name = name;
        this.path = repository.getPath() + name;
        setBaseNameFromName(name);
    }

    public long lastModified() {
        return repository.lastModified();
    }

    public boolean exists() {
        if (exists < 0) {
            try {
                exists = context.getResource(path) != null ? 1 : 0;
            } catch (MalformedURLException mux) {
                exists = 0;
            }
        }
        return exists == 1;
    }

    public long getLength() {
        return 0;
    }

    public InputStream getInputStream() throws IOException {
        return context.getResourceAsStream(path);
    }

    public URL getUrl() throws MalformedURLException {
        return context.getResource(path);
    }

    @Override
    public String toString() {
        return "WebappResource[" + path + "]";
    }


    @Override
    public int hashCode() {
        return 37 + path.hashCode();
    }

    @Override
    public boolean equals(Object obj) {
        return obj instanceof WebappResource && path.equals(((WebappResource)obj).path);
    }
}
